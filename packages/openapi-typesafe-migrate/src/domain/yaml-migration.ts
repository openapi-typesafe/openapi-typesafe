import {
  type CommandMigration,
  commandWordFindings,
  type Locate,
  type ShellTextFindings,
} from "./command-migration.js";
import { type CommandPathPattern, isCommandPath } from "./command-paths.js";
import {
  type DocumentString,
  isMap,
  ownerKey,
  type TreeNode,
  textEntries,
} from "./config-documents.js";
import type { FileVariables } from "./file-variables.js";
import { type Change, lineLocator } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import { shellVariables } from "./shell-variables.js";
import { type ShellCommand, type ShellWord, shellCommands } from "./shell-words.js";
import { applyTextEdits, type TextEdit } from "./text-edits.js";
import { YAML_COMMAND_KEYS } from "./yaml-command-keys.js";

/**
 * YAML files are migrated only where they hold commands or package names, so the text of other
 * values (an OpenAPI `description`, a label) stays as written even when it names a package.
 */

/** Top-level keys of an API description: OpenAPI 3, Swagger 2 and AsyncAPI documents. */
const API_DESCRIPTION_KEYS: ReadonlySet<string> = new Set(["openapi", "swagger", "asyncapi"]);

/**
 * True for an API description, whose values are data (an example `command`, a `default`), not
 * commands that anything runs: such a file is not migrated, however its keys are named.
 */
export const isApiDescription = (documents: readonly TreeNode[]): boolean =>
  documents.some(
    (root) =>
      isMap(root) && textEntries(root).some(({ key }) => API_DESCRIPTION_KEYS.has(key.value)),
  );

/**
 * Keys whose map holds environment variables (GitHub Actions, Drone and Woodpecker `env`). A
 * variable can hold a command that a step runs as `$GEN`, so each value is read as shell text:
 * it changes only where the generator is in command position, never in a sentence that names it.
 */
const ENVIRONMENT_KEYS: ReadonlySet<string> = new Set(["env"]);

const isEnvironmentValue = (value: DocumentString): boolean =>
  value.path.length >= 2 && ENVIRONMENT_KEYS.has(String(value.path.at(-2)));

/**
 * The `env` variables of a file as its commands use them: `$GEN` runs the generator when an `env`
 * map sets `GEN` to it. The maps of a workflow, a job and a step are read as one, by name.
 */
function environmentVariables(text: string, strings: readonly DocumentString[]): FileVariables {
  return shellVariables(
    strings.filter(isEnvironmentValue).map((value) => ({
      name: String(value.path.at(-1)),
      value: value.isEscaped ? value.value : shellText(text, value),
    })),
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
 * The shell text of a value: where YAML folds a line break to a space, so does the shell text.
 * The replacement keeps the length, so offsets into it are offsets into the value as written.
 */
/**
 * A GitHub Actions expression that reads one `env` variable: `${{ env.NAME }}`. The runner puts its
 * value into the command before the shell runs, as the shell expands `$NAME`.
 */
const ENV_EXPRESSION_RE = /\$\{\{[ \t]*env\.([A-Za-z_][A-Za-z0-9_]*)[ \t]*\}\}/g;

/** `${{ env.NAME }}` read as `$NAME`, padded with blanks so that every offset stays. */
const asShellVariable = (expression: string, name: string): string =>
  `$${name}`.padEnd(expression.length, " ");

export function shellText(text: string, value: DocumentString): string {
  const slice = text.slice(value.content.start, value.content.end);
  const unfolded = value.isFolded ? slice.replace(FOLDED_LINE_BREAK_RE, " ") : slice;
  return unfolded.replace(ENV_EXPRESSION_RE, asShellVariable);
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

/** The values that belong to one of `keys`, also as items of a list. */
const valuesOf = (
  strings: readonly DocumentString[],
  keys: ReadonlySet<string>,
): DocumentString[] => strings.filter((string) => keys.has(ownerKey(string.path) ?? ""));

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

/**
 * The findings of a value with an escape (`"echo \"Don't\" && …"`), read as the value the shell
 * gets: its text as written would read `\"` as a quote and `'` as the start of a quoted word.
 * The offsets of the value are not those of the text, so a changed value replaces the whole
 * scalar, quoted as it was, and every finding names the line where the scalar starts.
 */
function escapedValueFindings(
  value: DocumentString,
  encode: (value: string) => string,
  locate: Locate,
  variables?: FileVariables,
): ShellTextFindings {
  const commands = shellCommands(value.value);
  const found = commandWordFindings(commands, () => locate(value.start), variables);
  const migrated = applyTextEdits(value.value, found.edits);
  const isChanged = migrated !== value.value;
  const edits = isChanged ? [{ start: value.start, end: value.end, text: encode(migrated) }] : [];
  return { ...found, edits };
}

/** The findings of one value read as shell text, with offsets into the whole text. */
function valueFindings(
  text: string,
  value: DocumentString,
  locate: Locate,
  variables?: FileVariables,
): ShellTextFindings {
  if (value.isEscaped && value.encode !== undefined) {
    return escapedValueFindings(value, value.encode, locate, variables);
  }
  const { start } = value.content;
  const shell = shellText(text, value);
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

/**
 * Migrate the commands of a YAML file (CI workflows, Compose files, hook configs). Edits replace
 * words only, never the blanks between them, so they apply to the value as written even where a
 * folded scalar was read with spaces for its line breaks.
 */
export function migrateYamlCommands(
  text: string,
  file: string,
  strings: readonly DocumentString[],
  keys: ReadonlySet<string> = YAML_COMMAND_KEYS,
): CommandMigration {
  const values = valuesOf(strings, keys);
  const lineOf = lineLocator(text);
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const commandValues = new Set(values.filter((value) => !isExecFormItem(value)));
  const shellValues = strings.filter(
    (value) => commandValues.has(value) || isEnvironmentValue(value),
  );
  const variables = environmentVariables(text, strings);
  return appliedFindings(text, [
    ...shellValues.map((value) => valueFindings(text, value, locate, variables)),
    commandWordFindings(execFormCommands(text, values.filter(isExecFormItem)), locate),
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
    commands.map((command) => valueFindings(text, command, () => command.path.join("."))),
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
