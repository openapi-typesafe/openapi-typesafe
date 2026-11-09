import {
  type CommandMigration,
  commandWordFindings,
  type FileVariables,
  type Locate,
  runsGenerator,
  type ShellTextFindings,
} from "./command-migration.js";
import { type DocumentString, ownerKey } from "./config-documents.js";
import { type Change, lineLocator } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import { type ShellCommand, type ShellWord, shellCommands } from "./shell-words.js";
import { applyTextEdits, type TextEdit } from "./text-edits.js";

/**
 * YAML files are migrated only where they hold commands or package names, so the text of other
 * values (an OpenAPI `description`, a label) stays as written even when it names a package.
 */

/**
 * Keys whose value is a shell command or a list of them: GitHub Actions and lefthook `run`,
 * GitLab, Travis and Bitbucket `script` and its hooks, Azure Pipelines `script` / `bash` /
 * `pwsh`, CircleCI `command`, Drone `commands`, Docker Compose `command` and `entrypoint`.
 */
export const YAML_COMMAND_KEYS: ReadonlySet<string> = new Set([
  "run",
  "script",
  "before_script",
  "after_script",
  "before_install",
  "install",
  "bash",
  "pwsh",
  "powershell",
  "command",
  "commands",
  "entrypoint",
]);

/**
 * Keys whose map holds environment variables (GitHub Actions, Drone and Woodpecker `env`). A
 * variable can hold a command that a step runs as `$GEN`, so each value is read as shell text:
 * it changes only where the generator is in command position, never in a sentence that names it.
 */
const ENVIRONMENT_KEYS: ReadonlySet<string> = new Set(["env"]);

const isEnvironmentValue = (value: DocumentString): boolean =>
  value.path.length >= 2 && ENVIRONMENT_KEYS.has(String(value.path.at(-2)));

/** A whole word that expands one shell variable: `$NAME`, `${NAME}`, also in double quotes. */
const SHELL_VARIABLE_RE = /^"?\$(?:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\})"?$/;

/**
 * The `env` variables of a file as its commands use them: `$GEN` runs the generator when an `env`
 * map sets `GEN` to it. The maps of a workflow, a job and a step are read as one, by name.
 */
function environmentVariables(text: string, strings: readonly DocumentString[]): FileVariables {
  const values = new Map<string, string>();
  const generators = new Set<string>();
  for (const value of strings.filter(isEnvironmentValue)) {
    const name = String(value.path.at(-1));
    const shell = shellText(text, value);
    values.set(name, [values.get(name), shell].filter((part) => part !== undefined).join(" "));
    if (shellCommands(shell).some(runsGenerator)) {
      generators.add(name);
    }
  }
  const nameAt = (word: ShellWord): string => {
    const match = SHELL_VARIABLE_RE.exec(word.raw);
    return match === null ? "" : (match[1] ?? match[2] ?? "");
  };
  return {
    isGenerator: (program) => generators.has(nameAt(program)),
    referenceAt: (word) => {
      const value = values.get(nameAt(word));
      return value === undefined ? undefined : { written: word.raw, value };
    },
  };
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
function shellText(text: string, value: DocumentString): string {
  const slice = text.slice(value.content.start, value.content.end);
  return value.isFolded ? slice.replace(FOLDED_LINE_BREAK_RE, " ") : slice;
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

/** The findings of one value read as shell text, with offsets into the whole text. */
function valueFindings(
  text: string,
  value: DocumentString,
  locate: Locate,
  variables?: FileVariables,
): ShellTextFindings {
  const { start } = value.content;
  const commands = shellCommands(shellText(text, value));
  const found = commandWordFindings(commands, (offset) => locate(start + offset), variables);
  return { ...found, edits: shiftedEdits(found.edits, start) };
}

/** The edits of shell findings in a value, as offsets into the whole text. */
const shiftedEdits = (edits: readonly TextEdit[], offset: number): TextEdit[] =>
  edits.map((edit) => ({ ...edit, start: edit.start + offset, end: edit.end + offset }));

function appliedFindings(text: string, found: readonly ShellTextFindings[]): CommandMigration {
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
): CommandMigration {
  const values = valuesOf(strings, YAML_COMMAND_KEYS);
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

/** The top-level key of a pnpm `package.yaml` whose values are scripts. */
const SCRIPTS_KEY = "scripts";

const isScript = (string: DocumentString): boolean =>
  string.path.length === 2 && string.path[0] === SCRIPTS_KEY;

/** Migrate the scripts of a pnpm `package.yaml` manifest; each finding names its script. */
export function migrateYamlScripts(
  text: string,
  strings: readonly DocumentString[],
): CommandMigration {
  const scripts = strings.filter(isScript);
  return appliedFindings(
    text,
    scripts.map((script) => valueFindings(text, script, () => script.path.join("."))),
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
