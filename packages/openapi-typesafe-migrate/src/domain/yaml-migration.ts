import {
  type CommandMigration,
  commandWordFindings,
  type Locate,
  type ShellTextFindings,
} from "./command-migration.js";
import { type CommandPathPattern, isCommandPath } from "./command-paths.js";
import { type DocumentString, ownerKey } from "./config-documents.js";
import type { FileVariables } from "./file-variables.js";
import { isInputDefault, withInputDefaults } from "./input-defaults.js";
import { type Change, lineLocator } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import { shellVariables } from "./shell-variables.js";
import { type ShellCommand, type ShellWord, shellCommands } from "./shell-words.js";
import { otherShellFindings, stepShells } from "./step-shells.js";
import { applyTextEdits, type TextEdit } from "./text-edits.js";
import {
  DEFAULT_YAML_FILE,
  type EnvironmentEntry,
  environmentEntries,
  type VariableReferences,
  withVariableReferences,
  type YamlCommandFile,
  type YamlEnvironment,
} from "./yaml-environments.js";

/**
 * YAML files are migrated only where they hold commands or package names, so the text of other
 * values (an OpenAPI `description`, a label) stays as written even when it names a package.
 */

/**
 * The variables of a file as its commands use them (yaml-environments.ts): `$GEN` runs the
 * generator when a map sets `GEN` to it. The maps of a workflow, a job and a step are read as
 * one, by name.
 */
function environmentVariables(
  text: string,
  entries: ReadonlyMap<DocumentString, EnvironmentEntry>,
  references: VariableReferences,
): FileVariables {
  return shellVariables(
    [...entries].map(([value, entry]) => {
      const shell = value.isEscaped
        ? withVariableReferences(value.value, references)
        : shellText(text, value, references);
      return { name: entry.name, value: shell.slice(entry.head) };
    }),
  );
}

/** Keys of a Dependabot config whose values are package names (`ignore`, `allow`, `groups`). */
export const DEPENDABOT_NAME_KEYS: ReadonlySet<string> = new Set([
  "dependency-name",
  "patterns",
  "exclude-patterns",
]);

/** A line break between two lines with text; a blank line between them stays a line break. */
const FOLDED_LINE_BREAK_RE = /(?<=\S[^\S\n]*)\n(?=[^\S\n]*\S)/g;

/**
 * The shell text of a value: where YAML folds a line break to a space, so does the shell text,
 * and a reference that the runner replaces is read as the variable it names. The replacements
 * keep the length, so offsets into it are offsets into the value as written.
 */
export function shellText(
  text: string,
  value: DocumentString,
  references?: VariableReferences,
): string {
  const slice = text.slice(value.content.start, value.content.end);
  const unfolded = value.isFolded ? slice.replace(FOLDED_LINE_BREAK_RE, " ") : slice;
  return withVariableReferences(unfolded, references);
}

const LEADING_SPACES_RE = /^ */;

/**
 * The indentation of a block scalar as written: the fewest spaces at the start of its lines after
 * the first, which YAML removes from the value the shell runs. 0 for a value on one line.
 */
function blockIndent(shell: string): number {
  const lines = shell
    .split("\n")
    .slice(1)
    .filter((line) => line.trim() !== "");
  const indents = lines.map((line) => LEADING_SPACES_RE.exec(line)?.[0].length ?? 0);
  return indents.length === 0 ? 0 : Math.min(...indents);
}

/**
 * Each place of the text once: a YAML alias gives the strings of its anchor again, at its own
 * path (`script: [*scripts]`), and the first path that reads a place as shell text reads it.
 */
function oncePerPlace(strings: readonly DocumentString[]): DocumentString[] {
  const starts = new Set<number>();
  return strings.filter((string) => {
    const isFirst = !starts.has(string.start);
    starts.add(string.start);
    return isFirst;
  });
}

/** The values that belong to one of `keys`, also as items of a list. */
const valuesOf = (
  strings: readonly DocumentString[],
  keys: ReadonlySet<string>,
): DocumentString[] =>
  oncePerPlace(strings.filter((string) => keys.has(ownerKey(string.path) ?? "")));

/**
 * Keys whose list value is one command in exec form, as Compose and Kubernetes read it: each item
 * is one word, and no shell splits it. A string value of these keys is still shell text.
 */
const EXEC_FORM_KEYS: ReadonlySet<string> = new Set(["command", "entrypoint"]);

const isExecFormItem = (value: DocumentString): boolean =>
  typeof value.path.at(-1) === "number" && EXEC_FORM_KEYS.has(String(value.path.at(-2)));

const listOf = (item: DocumentString): string => item.path.slice(0, -1).join(".");

/** The next item of the same list: the documents of a stream may repeat a list's path. */
const isNextItem = (previous: DocumentString, item: DocumentString): boolean =>
  listOf(previous) === listOf(item) && Number(item.path.at(-1)) > Number(previous.path.at(-1));

/** The commands of exec-form lists, one per list, each item a word. */
function execFormCommands(text: string, items: readonly DocumentString[]): ShellCommand[] {
  const commands: ShellWord[][] = [];
  let previous: DocumentString | undefined;
  let command: ShellWord[] = [];
  for (const item of items) {
    if (previous === undefined || !isNextItem(previous, item)) {
      command = [];
      commands.push(command);
    }
    const { start, end } = item.content;
    command.push({ start, end, value: item.value, raw: text.slice(start, end) });
    previous = item;
  }
  return commands;
}

/** What the values of one file are read with. */
interface ValueContext {
  readonly text: string;
  readonly locate: Locate;
  readonly variables?: FileVariables;
  readonly references?: VariableReferences;
}

/**
 * The findings of a value with an escape (`"echo \"Don't\" && …"`), read as the value the shell
 * gets: its text as written would read `\"` as a quote and `'` as the start of a quoted word.
 * The offsets of the value are not those of the text, so a changed value replaces the whole
 * scalar, quoted as it was, and every finding names the line where the scalar starts.
 */
function escapedValueFindings(
  value: DocumentString,
  encode: (value: string) => string,
  { locate, variables, references }: ValueContext,
): ShellTextFindings {
  const commands = shellCommands(withVariableReferences(value.value, references));
  const found = commandWordFindings(commands, () => locate(value.start), variables);
  const migrated = applyTextEdits(value.value, found.edits);
  const isChanged = migrated !== value.value;
  const edits = isChanged ? [{ start: value.start, end: value.end, text: encode(migrated) }] : [];
  return { ...found, edits };
}

/** The findings of one value read as shell text, with offsets into the whole text. */
function valueFindings(value: DocumentString, context: ValueContext): ShellTextFindings {
  if (value.isEscaped && value.encode !== undefined) {
    return escapedValueFindings(value, value.encode, context);
  }
  const { text, locate, variables, references } = context;
  const { start } = value.content;
  const shell = shellText(text, value, references);
  const commands = shellCommands(shell, blockIndent(shell));
  const found = commandWordFindings(commands, (offset) => locate(start + offset), variables);
  return { ...found, edits: shiftedEdits(found.edits, start) };
}

/** The edits of shell findings in a value, as offsets into the whole text. */
const shiftedEdits = (edits: readonly TextEdit[], offset: number): TextEdit[] =>
  edits.map((edit) => ({ ...edit, start: edit.start + offset, end: edit.end + offset }));

export function appliedFindings(
  text: string,
  found: readonly ShellTextFindings[],
): CommandMigration {
  return {
    text: applyTextEdits(
      text,
      found.flatMap((findings) => findings.edits),
    ),
    changes: found.flatMap((findings) => findings.changes),
    manualSteps: found.flatMap((findings) => findings.manualSteps),
  };
}

/** What the values of a file are read with: its variables and the references to them. */
function valueContext(
  { text, locate }: Pick<ValueContext, "text" | "locate">,
  strings: readonly DocumentString[],
  entries: ReadonlyMap<DocumentString, EnvironmentEntry>,
  environment: YamlEnvironment,
): ValueContext {
  const names = new Set([...entries.values()].map((entry) => entry.name));
  const references = { environment, names };
  const fileVariables = environmentVariables(text, entries, references);
  return { text, locate, variables: withInputDefaults(fileVariables, strings), references };
}

/**
 * Migrate the commands of a YAML file (CI workflows, Compose files, hook configs). Edits replace
 * words only, never the blanks between them, so they apply to the value as written even where a
 * folded scalar was read with spaces for its line breaks.
 */
export function migrateYamlCommands(
  text: string,
  file: string,
  strings: readonly DocumentString[],
  { commandKeys, environment }: YamlCommandFile = DEFAULT_YAML_FILE,
): CommandMigration {
  const lineOf = lineLocator(text);
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const shellOf = stepShells(strings);
  const values = valuesOf(strings, commandKeys).filter((value) => shellOf(value) === undefined);
  const commandValues = new Set(values.filter((value) => !isExecFormItem(value)));
  const entries = environmentEntries(strings, environment);
  const isVariable = (value: DocumentString): boolean =>
    entries.has(value) || isInputDefault(value);
  const shellValues = oncePerPlace(
    strings.filter((value) => commandValues.has(value) || isVariable(value)),
  );
  const context = valueContext({ text, locate }, strings, entries, environment);
  return appliedFindings(text, [
    ...shellValues.map((value) => valueFindings(value, context)),
    commandWordFindings(execFormCommands(text, values.filter(isExecFormItem)), locate),
    otherShellFindings(valuesOf(strings, commandKeys), shellOf, locate),
  ]);
}

/**
 * Migrate the commands of a YAML config at the paths of `patterns` (domain/command-paths.ts): a
 * pnpm `package.yaml`, a lint-staged config. Each finding names its place (`scripts.gen`).
 */
export function migrateYamlPathCommands(
  text: string,
  strings: readonly DocumentString[],
  patterns: readonly CommandPathPattern[],
): CommandMigration {
  const commands = strings.filter((string) => isCommandPath(string.path, patterns));
  return appliedFindings(
    text,
    commands.map((command) =>
      valueFindings(command, { text, locate: () => command.path.join(".") }),
    ),
  );
}

/** Rename the original packages that a Dependabot config ignores, allows or groups. */
export function migrateDependabotConfig(
  text: string,
  file: string,
  strings: readonly DocumentString[],
): CommandMigration {
  const changes: Change[] = [];
  const edits: TextEdit[] = [];
  const lineOf = lineLocator(text);
  for (const value of valuesOf(strings, DEPENDABOT_NAME_KEYS)) {
    const from = value.value;
    const to = PACKAGE_RENAMES.get(from);
    if (to !== undefined) {
      const { start, end } = value.content;
      const location = `${file}:${lineOf(start)}`;
      changes.push({ kind: "package-name-renamed", location, from, to });
      edits.push({ start, end, text: to });
    }
  }
  return { text: applyTextEdits(text, edits), changes, manualSteps: [] };
}
