import {
  type CommandMigration,
  commandWordFindings,
  type Locate,
  type ShellTextFindings,
} from "./command-migration.js";
import { type CommandPathPattern, isCommandPath } from "./command-paths.js";
import { type DocumentString, ownerKey } from "./config-documents.js";
import type { FileVariables } from "./file-variables.js";
import { inputValues } from "./input-defaults.js";
import { type Change, lineLocator } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import { type ShellCommand, type ShellWord, shellCommands } from "./shell-words.js";
import { otherShellFindings, stepShells } from "./step-shells.js";
import { applyTextEdits, type TextEdit } from "./text-edits.js";
import { containerCommands, isContainerListItem } from "./yaml-entrypoints.js";
import { environmentEntries, environmentItemSteps } from "./yaml-environment-entries.js";
import {
  DEFAULT_YAML_FILE,
  type VariableReferences,
  withVariableReferences,
  type YamlCommandFile,
} from "./yaml-environments.js";
import { parameterDefaults } from "./yaml-parameters.js";
import { scopedVariables } from "./yaml-scoped-variables.js";
import { shellText } from "./yaml-shell-text.js";

export { shellText } from "./yaml-shell-text.js";

/**
 * YAML files are migrated only where they hold commands or package names, so the text of other
 * values (an OpenAPI `description`, a label) stays as written even when it names a package.
 */

/** Keys of a Dependabot config whose values are package names (`ignore`, `allow`, `groups`). */
export const DEPENDABOT_NAME_KEYS: ReadonlySet<string> = new Set([
  "dependency-name",
  "patterns",
  "exclude-patterns",
]);

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
  const read = withVariableReferences(value.value, references);
  const commands = shellCommands(read);
  const findings = commandWordFindings(commands, () => locate(value.start), variables);
  const found = withWrittenWords(findings, commands, { read, written: value.value });
  const migrated = applyTextEdits(value.value, found.edits);
  const isChanged = migrated !== value.value;
  const edits = isChanged ? [{ start: value.start, end: value.end, text: encode(migrated) }] : [];
  return { ...found, edits };
}

/** A value as the shell reads it and as it is written, with the same offsets. */
interface ReadValue {
  readonly read: string;
  readonly written: string;
}

const PADDING = " ";

/**
 * A word of the read value as written: a reference that the file's tool replaces is read in
 * another form of the same length (`{{.GEN}}` as `$GEN` and blanks), so the word goes on to the
 * last written character over the blanks after it.
 */
function writtenWord({ read, written }: ReadValue, word: ShellWord): string {
  let blanks = word.end;
  while (read[blanks] === PADDING) {
    blanks += 1;
  }
  const covered = written.slice(word.end, blanks).trimEnd();
  return written.slice(word.start, word.end + covered.length);
}

/**
 * The findings with the variables they name as written: the shell read a reference that the
 * file's tool replaces (`<< parameters.gen >>`, `${{ env.GEN }}`) in another form.
 */
function withWrittenWords(
  found: ShellTextFindings,
  commands: readonly ShellCommand[],
  value: ReadValue,
): ShellTextFindings {
  const words = new Map(commands.flat().map((word) => [word.raw, writtenWord(value, word)]));
  const manualSteps = found.manualSteps.map((step) =>
    "variable" in step ? { ...step, variable: words.get(step.variable) ?? step.variable } : step,
  );
  return { ...found, manualSteps };
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
  const findings = commandWordFindings(commands, (offset) => locate(start + offset), variables);
  const written = text.slice(start, value.content.end);
  const found = withWrittenWords(findings, commands, { read: shell, written });
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

/**
 * Migrate the commands of a YAML file (CI workflows, Compose files, hook configs). Edits replace
 * words only, never the blanks between them, so they apply to the value as written even where a
 * folded scalar was read with spaces for its line breaks.
 */
export function migrateYamlCommands(
  text: string,
  file: string,
  strings: readonly DocumentString[],
  { commandKeys, environment, parameters }: YamlCommandFile = DEFAULT_YAML_FILE,
): CommandMigration {
  const lineOf = lineLocator(text);
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const shellOf = stepShells(strings);
  const values = valuesOf(strings, commandKeys).filter((value) => shellOf(value) === undefined);
  const commandValues = new Set(values.filter((value) => !isContainerListItem(value)));
  const { findings, scripts } = containerCommands(text, strings, locate);
  const entries = environmentEntries(strings, environment);
  const defaults = parameterDefaults(strings, parameters);
  const isShellText = (value: DocumentString): boolean =>
    commandValues.has(value) || scripts.has(value) || entries.has(value) || defaults.has(value);
  const shellValues = oncePerPlace(strings.filter(isShellText));
  const names = new Set([...entries.values()].map((entry) => entry.name));
  const references = { environment, names, parameters };
  const inputs = inputValues(defaults);
  const variablesAt = scopedVariables({ text, entries, inputs, references });
  const contextOf = (value: DocumentString): ValueContext => ({
    ...{ text, locate, references },
    variables: variablesAt(value),
  });
  return appliedFindings(text, [
    ...shellValues.map((value) => valueFindings(value, contextOf(value))),
    ...findings,
    otherShellFindings(valuesOf(strings, commandKeys), shellOf, locate),
    { edits: [], changes: [], manualSteps: environmentItemSteps(strings, entries, locate) },
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
