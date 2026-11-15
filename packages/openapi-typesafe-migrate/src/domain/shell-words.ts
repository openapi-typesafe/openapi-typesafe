import { simpleCommand } from "./compound-commands.js";
import { type HeredocBody, heredocAt, type PendingHeredoc, readBodies } from "./here-documents.js";
import { inlineCode } from "./inline-code.js";
import { wordExpansions } from "./parameter-expansions.js";
import {
  argumentAssignments,
  assignmentValue,
  holdsCommandLine,
  type ShellAssignment,
  shellAssignments,
} from "./shell-assignments.js";
import { SHELLS, shellScript } from "./shell-scripts.js";
import {
  COMMAND_SEPARATORS,
  isLineContinuation,
  readWord,
  type ShellCommand,
  type ShellWord,
  WORD_BREAKS,
  wordPart,
} from "./shell-word-parts.js";
import { movedWord, type PlacedText, placedWord, rawText, unquotedRawText } from "./word-places.js";
import { expressionLiterals } from "./workflow-expressions.js";

export type { ShellCommand, ShellWord } from "./shell-word-parts.js";

const COMMENT = "#";
const LINE_BREAK = "\n";

/**
 * Splits shell text (a package.json script, a line of a shell script, Makefile or CI step) into
 * simple commands, each a list of words with their offsets. It follows the POSIX shell rules that
 * decide where a word and a command end: quotes, backslash escapes, line continuations, comments
 * and the control operators. It does not expand anything, so it never runs or guesses a value.
 */

/** Where the blank, continuation or comment at `index` ends, or `index` if there is none. */
function skipTrivia(text: string, index: number): number {
  const char = text[index] as string;
  if (WORD_BREAKS.has(char)) {
    return index + 1;
  }
  if (isLineContinuation(text, index)) {
    return text.indexOf("\n", index) + 1;
  }
  if (char === COMMENT) {
    const lineEnd = text.indexOf("\n", index);
    return lineEnd === -1 ? text.length : lineEnd;
  }
  return index;
}

/**
 * The commands of a text without nested ones, the bodies of its here-documents, and the commands
 * whose output a pipe gives to the next one (`cat <<EOF | sh`).
 */
interface TopLevel {
  readonly commands: ShellWord[][];
  readonly heredocs: HeredocBody[];
  readonly pipes: ReadonlySet<number>;
}

/**
 * A pipe; the two `|` of `||` give an empty command between the two around them, which is no
 * command that a pipe gives a here-document.
 */
const PIPE = "|";

/**
 * The commands of `text`, in order, without nested ones. The body of a here-document is input
 * data, not commands: a `'` in it (`Don't edit`) opened a quote to the end of the text, and
 * every command after it was lost.
 */
function topLevelCommands(text: string, indent: number): TopLevel {
  const commands: ShellWord[][] = [[]];
  const heredocs: HeredocBody[] = [];
  const pipes = new Set<number>();
  let pending: PendingHeredoc[] = [];
  let index = 0;
  while (index < text.length) {
    const afterTrivia = skipTrivia(text, index);
    const heredoc = heredocAt(text, index, { command: commands.length - 1, indent });
    if (heredoc !== undefined) {
      pending.push(...(heredoc.pending === undefined ? [] : [heredoc.pending]));
      index = heredoc.end;
    } else if (afterTrivia !== index) {
      index = afterTrivia;
    } else if (text[index] === LINE_BREAK && pending.length > 0) {
      const read = readBodies(text, index + 1, pending);
      heredocs.push(...read.bodies);
      pending = [];
      commands.push([]);
      index = read.end;
    } else if (COMMAND_SEPARATORS.has(text[index] as string)) {
      if (text[index] === PIPE) {
        pipes.add(commands.length - 1);
      }
      commands.push([]);
      index++;
    } else {
      const word = readWord(text, index);
      commands.at(-1)?.push(word);
      index = word.end;
    }
  }
  return { commands, heredocs, pipes };
}

const QUOTES: ReadonlySet<string> = new Set(["'", '"']);
/** A quoted word with more than one word in it may be a command (`sh -c "…"`, `concurrently`). */
const NESTED_COMMAND_RE = /[\s;&|()`]/;

/** Whether a word is one quoted string that holds a command line. */
function isQuotedCommandLine(word: ShellWord): boolean {
  const quote = word.raw[0] as string;
  const isOneQuotedString =
    QUOTES.has(quote) &&
    word.raw.length > 1 &&
    word.raw.endsWith(quote) &&
    wordPart(word.raw, 0).end === word.raw.length;
  return isOneQuotedString && NESTED_COMMAND_RE.test(word.value);
}

/**
 * The command line inside a word, as the shell that runs it reads it: the quotes and escapes of
 * the word taken off (`"X='npx openapi-typescript'; \$X a.yaml"` is `X='npx …'; $X a.yaml`),
 * each character placed where it is written. The `-c` word of a shell is one, however it is
 * quoted (`sh -c 'npx openapi-typescript '"'"'a.yaml'"'"''`); so is any word that is one quoted
 * string holding a command line.
 */
function nestedCommandText(word: ShellWord, script: ShellWord | undefined): PlacedText | undefined {
  return word === script || isQuotedCommandLine(word) ? unquotedRawText(word, 0) : undefined;
}

/** Docker's `RUN <<EOF` runs the here-document, or gives it to the command after its options. */
const DOCKER_RUN = "RUN";
/** A command that writes the here-document it reads as it is, so a pipe gives it on. */
const PASS_THROUGH = "cat";
const PATH_SEPARATOR = "/";
const OPTION_PREFIX = "-";

const programName = (command: ShellCommand): string =>
  command[0]?.value.split(PATH_SEPARATOR).at(-1) ?? "";

const isOption = (word: ShellWord): boolean => word.value.startsWith(OPTION_PREFIX);

/** Whether a command is a shell with options only, which runs its input as a script. */
const isScriptShell = (command: ShellCommand): boolean =>
  SHELLS.has(programName(command)) && command.slice(1).every(isOption);

/**
 * Whether a command runs the here-document it reads as a script: a shell with options only
 * (`bash -e <<EOF`), or `RUN` with options only or with such a shell after them (`RUN <<EOT
 * bash`). Any other command reads it as data (`cat`, `bash gen.sh`).
 */
function readsScript(command: ShellCommand): boolean {
  if (programName(command) !== DOCKER_RUN) {
    return isScriptShell(command);
  }
  const after = command.slice(1);
  const shell = after.slice(after.findIndex((word) => !isOption(word)));
  return after.every(isOption) || isScriptShell(shell);
}

/** Whether a command writes its here-document unchanged, so the next command of a pipe reads it. */
const passesThrough = (command: ShellCommand): boolean =>
  programName(command) === PASS_THROUGH && command.slice(1).every(isOption);

/**
 * The here-documents that the command at `index` runs as scripts: its own, when it reads them as
 * a script, and those of a `cat` whose output a pipe gives it, when it is a shell. Each is read
 * after the command that runs it, so the commands stay in the order of the text.
 */
function scriptsRunBy(top: TopLevel, index: number, command: ShellCommand): HeredocBody[] {
  const previous = index - 1;
  const isPipedScript =
    top.pipes.has(previous) &&
    isScriptShell(command) &&
    passesThrough(simpleCommand(top.commands[previous] ?? []));
  return top.heredocs.filter(
    (body) =>
      (body.command === index && readsScript(command)) ||
      (body.command === previous && isPipedScript),
  );
}

/** The commands of `text`, which starts at `offset` of a larger text, by offsets in that one. */
export function shellCommandsAt(text: string, offset: number, indent = 0): ShellCommand[] {
  return shellCommands(text, indent).map((words) => words.map((word) => movedWord(word, offset)));
}

/** The commands of a text read again as a command line, each word where it is written. */
export function placedCommands(placed: PlacedText): ShellCommand[] {
  return shellCommands(placed.text).map((words) => words.map((word) => placedWord(word, placed)));
}

/**
 * The words of the parameter expansions of a word (`${GEN:-npx …}`) and the string literals of
 * its workflow expressions (`${{ inputs.gen || 'npx …' }}`), read as command lines. A literal
 * inside the word of an expansion (`${GEN:-${{ … }}}`) is found when that word is read, so each
 * one is read once.
 */
function expansionCommands(word: ShellWord): ShellCommand[] {
  const expansions = wordExpansions(word.raw);
  const literals = expressionLiterals(word.raw).filter(({ start }) =>
    expansions.every((expansion) => start < expansion.start || start >= expansion.expansionEnd),
  );
  return [...expansions, ...literals].flatMap((part) =>
    placedCommands(rawText(word, part.start, part.text)),
  );
}

/**
 * The assignments of a command whose values are command lines: its own (`GEN=…`), and those
 * after its program that hold one (`cross-env GEN="npx openapi-typescript" node gen.js`).
 */
function commandLineAssignments(command: ShellCommand): Map<ShellWord, ShellAssignment> {
  const read = [
    ...shellAssignments(command),
    ...argumentAssignments(command).filter(holdsCommandLine),
  ];
  return new Map(read.map((assignment) => [assignment.word, assignment]));
}

/**
 * The command lines inside the words of a command: a quoted word that holds one, the value of an
 * assignment (`GEN="npx openapi-typescript"`), which runs where the variable is expanded, and
 * the word of a parameter expansion (`${GEN:-npx openapi-typescript}`). A text read as commands
 * is read once: its own expansions are found in it. The code of `python3 -c '…'` is no command
 * line.
 */
function innerCommands(command: ShellCommand): ShellCommand[] {
  const assignments = commandLineAssignments(command);
  const code = inlineCode(command)?.code;
  const script = shellScript(command);
  return command.flatMap((word) => {
    const inner = word === code ? undefined : nestedCommandText(word, script);
    if (inner !== undefined) {
      return placedCommands(inner);
    }
    const assignment = assignments.get(word);
    return assignment === undefined
      ? expansionCommands(word)
      : placedCommands(assignmentValue(assignment));
  });
}

/**
 * The commands of `text`, in order of their first word. A quoted word that holds a command line
 * is read as commands too, so `sh -c "openapi-typescript a.yaml"` and `concurrently "…"` count.
 * `indent` is the number of spaces at the start of each line that the shell does not see, such as
 * the indentation of a YAML block scalar: a here-document delimiter line may have them.
 */
export function shellCommands(text: string, indent = 0): ShellCommand[] {
  const top = topLevelCommands(text, indent);
  const commands: ShellCommand[] = [];
  for (const [index, words] of top.commands.entries()) {
    const command = simpleCommand(words);
    if (command.length > 0) {
      commands.push(command);
    }
    commands.push(...innerCommands(command));
    const scripts = scriptsRunBy(top, index, command);
    commands.push(...scripts.flatMap((body) => shellCommandsAt(body.text, body.start, indent)));
  }
  return commands;
}
