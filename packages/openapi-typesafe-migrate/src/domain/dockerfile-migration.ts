import type { Locate } from "./argument-findings.js";
import { commandLineItemFindings, commandLineItemsOf } from "./command-line-items.js";
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
  type FormInstruction,
} from "./dockerfile-entrypoints.js";
import {
  type DockerInstruction,
  dockerInstructions,
  escapeCharacter,
} from "./dockerfile-instructions.js";
import { dockerVariables, isVariableInstruction } from "./dockerfile-variables.js";
import { containerCommand } from "./entrypoint-arguments.js";
import { inlineCode } from "./inline-code.js";
import { lineLocator, type ManualStep } from "./migration-findings.js";
import { shellScript } from "./shell-scripts.js";
import { shellVariables } from "./shell-variables.js";
import { placedCommands, type ShellCommand, type ShellWord } from "./shell-words.js";
import { applyTextEdits } from "./text-edits.js";
import { placedWord, rawText } from "./word-places.js";

/**
 * Dockerfiles and Containerfiles, read one instruction at a time with its lines joined
 * (dockerfile-instructions.ts). `RUN`, `CMD` and `ENTRYPOINT` take a command in shell form (a
 * line the shell splits) or in exec form: a JSON array of strings, each one word, which no shell
 * splits. Docker reads an instruction whose argument is not a valid JSON array as shell form, and
 * so does the migration.
 */

/**
 * An instruction that takes a command, before its `[`, after the flags of `RUN`
 * (`--mount=type=cache,target=/root/.npm`, `--network=none`). In capitals, as Dockerfiles write
 * them and as the launcher table reads the shell form (command-launchers.ts).
 */
const EXEC_FORM_START_RE = /^[ \t]*(?:RUN|CMD|ENTRYPOINT)(?:[ \t]+--\S+)*[ \t]+\[/;
/** Blanks between the items of the array, on the one line of the joined instruction. */
const ARRAY_BLANK_RE = /[ \t]*/y;
/** A double-quoted string on one line; `JSON.parse` decides whether it is a JSON string. */
const QUOTED_RE = /"(?:[^"\\\n]|\\.)*"/y;
const ITEM_SEPARATOR = ",";
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

/**
 * The words of the exec-form array whose `[` is at `start` of a text, by offsets in that text, or
 * undefined when it is not one.
 */
function execFormAt(text: string, start: number): ExecForm | undefined {
  const words: ShellWord[] = [];
  let index = start + 1;
  for (;;) {
    index += matchAt(ARRAY_BLANK_RE, text, index)?.length ?? 0;
    const raw = matchAt(QUOTED_RE, text, index);
    if (raw === undefined) {
      const isEmpty = text[index] === ARRAY_END && words.length === 0;
      return isEmpty ? { words } : undefined;
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
      return { words };
    }
    if (text[index] !== ITEM_SEPARATOR) {
      return undefined;
    }
    index++;
  }
}

/** An instruction with its exec-form array, each word placed where the file writes it. */
function withExecForm(instruction: DockerInstruction): FormInstruction {
  const { text } = instruction;
  const start = EXEC_FORM_START_RE.exec(text.text)?.[0].length;
  const form = start === undefined ? undefined : execFormAt(text.text, start - 1);
  const words = form?.words.map((word) => placedWord(word, text));
  return { ...instruction, form: words === undefined ? undefined : { words } };
}

/** What the exec-form arrays run: the arrays, and the command lines of the shells they start. */
interface ExecCommands {
  readonly commands: readonly ShellCommand[];
  /** Command lines with JSON escapes, whose offsets do not map onto the file: reported only. */
  readonly escaped: readonly ShellWord[];
  /** The items that hold a whole command line of the generator, which no shell splits. */
  readonly commandLines: readonly ShellWord[];
}

/**
 * The commands that the exec-form arrays run: each array, except a `CMD` that an exec-form
 * entrypoint gets as arguments, which is read with it as the container runs them.
 */
function execRuns(forms: readonly ExecForm[], pairs: readonly ExecPair[]): ShellCommand[] {
  const paired = new Set(pairs.map((pair) => pair.command));
  return [
    ...forms.filter((form) => !paired.has(form)).map((form) => form.words),
    ...pairs.flatMap((pair) => containerCommand(pair.entrypoint.words, pair.command.words)),
  ];
}

/**
 * The items of the arrays that hold a whole command line of the generator, as the items of a
 * YAML exec form are read (command-line-items.ts): not the script of a shell's `-c`, nor the
 * code of an interpreter. An entrypoint that several commands are read with gives its item to
 * each, and the findings of one place are joined (textFindings).
 */
function commandLineWords(runs: readonly ShellCommand[], locate: Locate): ShellWord[] {
  const otherwise = new Set(
    runs.flatMap((words) => [shellScript(words), inlineCode(words)?.code].filter(isWord)),
  );
  return commandLineItemsOf(runs.flat(), (word) => otherwise.has(word), locate);
}

const isWord = (word: ShellWord | undefined): word is ShellWord => word !== undefined;

/** The commands of the exec-form arrays, with the command lines of the shells they start. */
function execCommands(runs: readonly ShellCommand[], locate: Locate): ExecCommands {
  const commands: ShellCommand[] = [];
  const escaped: ShellWord[] = [];
  for (const words of runs) {
    commands.push(words);
    const script = shellScript(words);
    if (script !== undefined && script.raw === script.value) {
      commands.push(...placedCommands(rawText(script, 0, script.value)));
    } else if (script !== undefined) {
      escaped.push(script);
    }
  }
  // An entrypoint that several commands are read with holds its script once.
  const scripts = new Map(escaped.map((script) => [script.start, script]));
  return { commands, escaped: [...scripts.values()], commandLines: commandLineWords(runs, locate) };
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
 * The shell-form commands of the instructions that are not `ARG` or `ENV`. Docker, not a shell,
 * reads those: their values are read once, as the commands that `$NAME` runs, so no word of them
 * (`ENV GEN=${GEN:-npx openapi-typescript}`) is edited twice.
 */
const shellFormCommands = (instructions: readonly FormInstruction[]): ShellCommand[] =>
  instructions
    .filter(({ keyword, form }) => form === undefined && !isVariableInstruction(keyword))
    .flatMap(({ text }) => placedCommands(text));

/**
 * Migrate the commands of a Dockerfile: exec-form arrays word by word, everything else as shell
 * text, with the values of `ARG` and `ENV` variables as commands that `$NAME` runs. Each finding
 * names its `file:line`.
 */
export function migrateDockerfile(text: string, file: string): CommandMigration {
  const lineOf = lineLocator(text);
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const instructions = dockerInstructions(text).map(withExecForm);
  const pairs = entrypointPairs(instructions);
  const exec = execCommands(
    execRuns(
      instructions.flatMap(({ form }) => form ?? []),
      pairs,
    ),
    locate,
  );
  // A value that runs the generator is migrated where it is set, its flags where it is used.
  const variables = dockerVariables(instructions, escapeCharacter(text));
  const definitions = variables.map(({ name, value }) => ({ name, value: value.text }));
  const values = variables.flatMap(({ value }) => placedCommands(value));
  const commands = [...shellFormCommands(instructions), ...values, ...exec.commands];
  const found = commandWordFindings(commands, locate, shellVariables(definitions));
  // A shell script entrypoint gets the items of a CMD as arguments, and may pass their flags on.
  const entry = textFindings([
    ...entrypointCommandFindings(pairs, locate),
    ...commandLineItemFindings(exec.commandLines, locate),
  ]);
  return {
    text: applyTextEdits(text, [...found.edits, ...entry.edits]),
    changes: [...found.changes, ...entry.changes],
    manualSteps: [
      ...found.manualSteps,
      ...entry.manualSteps,
      ...escapedScriptSteps(exec.escaped, lineOf),
    ],
  };
}
