import { type CommandMigration, commandWordFindings, migrateCommand } from "./command-migration.js";
import { lineLocator, type ManualStep } from "./migration-findings.js";
import { shellVariables, type VariableDefinition } from "./shell-variables.js";
import {
  type ShellCommand,
  type ShellWord,
  shellCommands,
  shellCommandsAt,
} from "./shell-words.js";
import { applyTextEdits } from "./text-edits.js";

/**
 * Dockerfiles and Containerfiles. `RUN`, `CMD` and `ENTRYPOINT` take a command in shell form (a
 * line the shell splits) or in exec form: a JSON array of strings, each one word, which no shell
 * splits. Docker reads an instruction whose argument is not a valid JSON array as shell form, and
 * so does the migration.
 */

/**
 * An instruction that takes a command, at the start of a line, before its `[`, after the flags of
 * `RUN` (`--mount=type=cache,target=/root/.npm`, `--network=none`). In capitals, as Dockerfiles
 * write them and as the launcher table reads the shell form (command-launchers.ts).
 */
const EXEC_FORM_START_RE = /^[ \t]*(?:RUN|CMD|ENTRYPOINT)(?:[ \t]+--\S+)*[ \t]+\[/gm;
/** Shells whose `-c` option takes a command line, as `SHELL` and the shell form use them. */
const SHELLS: ReadonlySet<string> = new Set(["sh", "bash", "dash", "ash", "zsh"]);
const OPTION_PREFIX = "-";
const LONG_OPTION_PREFIX = "--";
const COMMAND_OPTION = "c";
const SET_OPTION = "-o";
const PATH_SEPARATOR = "/";
/** Blanks between the items of the array; a `\` at the end of a line continues the instruction. */
const ARRAY_BLANK_RE = /(?:[ \t\r\n]|\\\r?\n)*/y;
/** A double-quoted string on one line; `JSON.parse` decides whether it is a JSON string. */
const QUOTED_RE = /"(?:[^"\\\n]|\\.)*"/y;
const ITEM_SEPARATOR = ",";
const NOT_LINE_BREAK_RE = /[^\n]/g;
const ARRAY_END = "]";
/** Instructions that set variables which later shell-form commands expand (`$GEN`). */
const VARIABLE_INSTRUCTIONS: ReadonlySet<string> = new Set(["ARG", "ENV"]);
const LEGACY_ENV_INSTRUCTION = "ENV";
const ASSIGNMENT = "=";
const QUOTES: ReadonlySet<string> = new Set(['"', "'"]);

/** Where a pattern with the sticky flag matches at `index`, or undefined. */
function matchAt(pattern: RegExp, text: string, index: number): string | undefined {
  pattern.lastIndex = index;
  return pattern.exec(text)?.[0];
}

/** The value of a JSON string, or undefined when `raw` is not one (a bad escape, a raw tab). */
function jsonString(raw: string): string | undefined {
  try {
    return JSON.parse(raw) as string;
  } catch (error) {
    // Docker reads an argument that is not valid JSON as shell form; so does the migration.
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

/** One exec-form array: where it starts (at the `[`) and ends (after the `]`), and its words. */
interface ExecForm {
  readonly start: number;
  readonly end: number;
  readonly words: readonly ShellWord[];
}

/** The exec-form array whose `[` is at `start`, or undefined when it is not one. */
function execFormAt(text: string, start: number): ExecForm | undefined {
  const words: ShellWord[] = [];
  let index = start + 1;
  for (;;) {
    index += matchAt(ARRAY_BLANK_RE, text, index)?.length ?? 0;
    const raw = matchAt(QUOTED_RE, text, index);
    if (raw === undefined) {
      const isEmpty = text[index] === ARRAY_END && words.length === 0;
      return isEmpty ? { start, end: index + 1, words } : undefined;
    }
    const value = jsonString(raw);
    if (value === undefined) {
      return undefined;
    }
    // A word is the text inside the quotes, as an exec-form item of a YAML file is.
    words.push({ start: index + 1, end: index + raw.length - 1, value, raw: raw.slice(1, -1) });
    index += raw.length;
    index += matchAt(ARRAY_BLANK_RE, text, index)?.length ?? 0;
    if (text[index] === ARRAY_END) {
      return { start, end: index + 1, words };
    }
    if (text[index] !== ITEM_SEPARATOR) {
      return undefined;
    }
    index++;
  }
}

/** The exec-form arrays of a Dockerfile, in order. */
function execForms(text: string): ExecForm[] {
  return [...text.matchAll(EXEC_FORM_START_RE)].flatMap((match) => {
    const form = execFormAt(text, match.index + match[0].length - 1);
    return form === undefined ? [] : [form];
  });
}

/**
 * The command line of `["sh", "-c", "…"]` (also `/bin/bash -o pipefail -ec`): the word after the
 * first short option that holds `c`, before any word that is not an option.
 */
function shellScript(words: readonly ShellWord[]): ShellWord | undefined {
  const program = words[0]?.value.split(PATH_SEPARATOR).at(-1) ?? "";
  if (!SHELLS.has(program)) {
    return undefined;
  }
  let index = 1;
  for (let option = words[index]?.value; option !== undefined; option = words[index]?.value) {
    if (!option.startsWith(OPTION_PREFIX)) {
      return undefined;
    }
    if (!option.startsWith(LONG_OPTION_PREFIX) && option.includes(COMMAND_OPTION)) {
      return words[index + 1];
    }
    // `-o pipefail` names a shell option in the next word.
    index += option === SET_OPTION ? 2 : 1;
  }
  return undefined;
}

/** What the exec-form arrays run: the arrays, and the command lines of the shells they start. */
interface ExecCommands {
  readonly commands: readonly ShellCommand[];
  /** Command lines with JSON escapes, whose offsets do not map onto the file: reported only. */
  readonly escaped: readonly ShellWord[];
}

function execCommands(forms: readonly ExecForm[]): ExecCommands {
  const commands: ShellCommand[] = [];
  const escaped: ShellWord[] = [];
  for (const { words } of forms) {
    commands.push(words);
    const script = shellScript(words);
    if (script !== undefined && script.raw === script.value) {
      commands.push(...shellCommandsAt(script.value, script.start));
    } else if (script !== undefined) {
      escaped.push(script);
    }
  }
  return { commands, escaped };
}

/** The text with the arrays blanked out, line breaks kept, so the shell reads the rest. */
function withoutExecForms(text: string, forms: readonly ExecForm[]): string {
  const parts: string[] = [];
  let copiedUpTo = 0;
  for (const { start, end } of forms) {
    parts.push(
      text.slice(copiedUpTo, start),
      text.slice(start, end).replace(NOT_LINE_BREAK_RE, " "),
    );
    copiedUpTo = end;
  }
  parts.push(text.slice(copiedUpTo));
  return parts.join("");
}

/** A command line that the migration would change but cannot edit in place, as a manual step. */
function escapedScriptSteps(scripts: readonly ShellWord[], lineOf: (offset: number) => number) {
  return scripts.flatMap((script): ManualStep[] => {
    const migrated = migrateCommand(script.value, "").text;
    return migrated === script.value
      ? []
      : [{ kind: "command-string", line: lineOf(script.start), to: migrated }];
  });
}

/** A variable that `ARG` or `ENV` sets: its name, and its value as commands at their offsets. */
interface DockerVariable {
  readonly name: string;
  readonly commands: readonly ShellCommand[];
}

/** The variable of one `NAME=value` word, its quotes taken off, or undefined. */
function assignedVariable(word: ShellWord): DockerVariable | undefined {
  const at = word.raw.indexOf(ASSIGNMENT);
  if (at <= 0) {
    return undefined;
  }
  const raw = word.raw.slice(at + 1);
  const isQuoted = raw.length >= 2 && QUOTES.has(raw[0] as string) && raw.at(-1) === raw[0];
  const value = isQuoted ? raw.slice(1, -1) : raw;
  const start = word.start + at + 1 + (isQuoted ? 1 : 0);
  return { name: word.raw.slice(0, at), commands: shellCommandsAt(value, start) };
}

/**
 * The variables that `ARG NAME=value` and `ENV NAME=value …` set, and `ENV NAME value`, the
 * legacy form that sets one variable to the rest of the line.
 */
function dockerVariables(commands: readonly ShellCommand[]): DockerVariable[] {
  return commands.flatMap(([instruction, first, ...rest]) => {
    if (instruction === undefined || first === undefined) {
      return [];
    }
    if (!VARIABLE_INSTRUCTIONS.has(instruction.value)) {
      return [];
    }
    if (instruction.value === LEGACY_ENV_INSTRUCTION && !first.raw.includes(ASSIGNMENT)) {
      return [{ name: first.value, commands: [rest] }];
    }
    return [first, ...rest].flatMap((word) => assignedVariable(word) ?? []);
  });
}

const definitionOf = ({ name, commands }: DockerVariable): VariableDefinition => ({
  name,
  value: commands.flatMap((words) => words.map((word) => word.raw)).join(" "),
});

/**
 * Migrate the commands of a Dockerfile: exec-form arrays word by word, everything else as shell
 * text, with the values of `ARG` and `ENV` variables as commands that `$NAME` runs. Each finding
 * names its `file:line`.
 */
export function migrateDockerfile(text: string, file: string): CommandMigration {
  const lineOf = lineLocator(text);
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const forms = execForms(text);
  const exec = execCommands(forms);
  const shellForm = shellCommands(withoutExecForms(text, forms));
  // A value that runs the generator is migrated where it is set, its flags where it is used.
  const definitions = dockerVariables(shellForm);
  const values = definitions.flatMap((variable) => variable.commands);
  const commands = [...shellForm, ...values, ...exec.commands];
  const variables = shellVariables(definitions.map(definitionOf));
  const { edits, changes, manualSteps } = commandWordFindings(commands, locate, variables);
  const steps = [...manualSteps, ...escapedScriptSteps(exec.escaped, lineOf)];
  return { text: applyTextEdits(text, edits), changes, manualSteps: steps };
}
