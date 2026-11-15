import {
  type CommandMigration,
  commandWordFindings,
  migrateCommand,
  textFindings,
} from "./command-migration.js";
import {
  type ExecForm,
  type ExecPair,
  entrypointCommandFindings,
  entrypointPairs,
} from "./dockerfile-entrypoints.js";
import { type VariableInstruction, variableInstructions } from "./dockerfile-variables.js";
import { containerCommand } from "./entrypoint-arguments.js";
import { lineLocator, type ManualStep } from "./migration-findings.js";
import { shellScript } from "./shell-scripts.js";
import { shellVariables } from "./shell-variables.js";
import {
  placedCommands,
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
/** Blanks between the items of the array; a `\` at the end of a line continues the instruction. */
const ARRAY_BLANK_RE = /(?:[ \t\r\n]|\\\r?\n)*/y;
/** A double-quoted string on one line; `JSON.parse` decides whether it is a JSON string. */
const QUOTED_RE = /"(?:[^"\\\n]|\\.)*"/y;
const ITEM_SEPARATOR = ",";
const NOT_LINE_BREAK_RE = /[^\n]/g;
const ARRAY_END = "]";

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

/** The words of the exec-form array whose `[` is at `start`, or undefined when it is not one. */
function execFormAt(text: string, start: number): Omit<ExecForm, "lineStart"> | undefined {
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

/** The exec-form arrays of a Dockerfile, in order, each with the start of its instruction line. */
function execForms(text: string): ExecForm[] {
  return [...text.matchAll(EXEC_FORM_START_RE)].flatMap((match) => {
    const form = execFormAt(text, match.index + match[0].length - 1);
    return form === undefined ? [] : [{ ...form, lineStart: match.index }];
  });
}

/** What the exec-form arrays run: the arrays, and the command lines of the shells they start. */
interface ExecCommands {
  readonly commands: readonly ShellCommand[];
  /** Command lines with JSON escapes, whose offsets do not map onto the file: reported only. */
  readonly escaped: readonly ShellWord[];
}

/**
 * The commands of the exec-form arrays: each array, except a `CMD` that an exec-form entrypoint
 * gets as arguments, which is read with it as the container runs them.
 */
function execCommands(forms: readonly ExecForm[], pairs: readonly ExecPair[]): ExecCommands {
  const paired = new Set(pairs.map((pair) => pair.command));
  const commands: ShellCommand[] = [];
  const escaped: ShellWord[] = [];
  const read = [
    ...forms.filter((form) => !paired.has(form)).map((form) => form.words),
    ...pairs.flatMap((pair) => containerCommand(pair.entrypoint.words, pair.command.words)),
  ];
  for (const words of read) {
    commands.push(words);
    const script = shellScript(words);
    if (script !== undefined && script.raw === script.value) {
      commands.push(...shellCommandsAt(script.value, script.start));
    } else if (script !== undefined) {
      escaped.push(script);
    }
  }
  // An entrypoint that several commands are read with holds its script once.
  const scripts = new Map(escaped.map((script) => [script.start, script]));
  return { commands, escaped: [...scripts.values()] };
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

/**
 * The shell-form commands that are not `ARG` or `ENV` instructions, nor read inside one. Docker,
 * not a shell, reads those: their values are read once, as the commands that `$NAME` runs, so
 * no word of them (`ENV GEN=${GEN:-npx openapi-typescript}`) is edited twice.
 */
function withoutVariableInstructions(
  commands: readonly ShellCommand[],
  instructions: readonly VariableInstruction[],
): ShellCommand[] {
  const isInInstruction = (words: ShellCommand): boolean => {
    const start = words[0]?.start ?? -1;
    return instructions.some(
      (instruction) => start >= instruction.start && start < instruction.end,
    );
  };
  return commands.filter((words) => !isInInstruction(words));
}

/**
 * Migrate the commands of a Dockerfile: exec-form arrays word by word, everything else as shell
 * text, with the values of `ARG` and `ENV` variables as commands that `$NAME` runs. Each finding
 * names its `file:line`.
 */
export function migrateDockerfile(text: string, file: string): CommandMigration {
  const lineOf = lineLocator(text);
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const forms = execForms(text);
  const pairs = entrypointPairs(text, forms);
  const exec = execCommands(forms, pairs);
  const shellForm = shellCommands(withoutExecForms(text, forms));
  const instructions = variableInstructions(text, shellForm);
  // A value that runs the generator is migrated where it is set, its flags where it is used.
  const variables = instructions.flatMap((instruction) => instruction.variables);
  const definitions = variables.map(({ name, value }) => ({ name, value: value.text }));
  const values = variables.flatMap(({ value }) => placedCommands(value));
  const run = withoutVariableInstructions(shellForm, instructions);
  const commands = [...run, ...values, ...exec.commands];
  const found = commandWordFindings(commands, locate, shellVariables(definitions));
  // A shell script entrypoint gets the items of a CMD as arguments, and may pass their flags on.
  const entry = textFindings(entrypointCommandFindings(pairs, locate));
  const edits = [...found.edits, ...entry.edits];
  const changes = [...found.changes, ...entry.changes];
  const steps = [...found.manualSteps, ...entry.manualSteps];
  return {
    text: applyTextEdits(text, edits),
    changes,
    manualSteps: [...steps, ...escapedScriptSteps(exec.escaped, lineOf)],
  };
}
