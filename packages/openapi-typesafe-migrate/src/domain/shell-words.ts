import { type HeredocBody, heredocAt, type PendingHeredoc, readBodies } from "./here-documents.js";
import {
  COMMAND_SEPARATORS,
  isLineContinuation,
  readWord,
  type ShellCommand,
  type ShellWord,
  WORD_BREAKS,
  wordPart,
} from "./shell-word-parts.js";

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

/** The commands of a text without nested ones, and the bodies of its here-documents. */
interface TopLevel {
  readonly commands: ShellWord[][];
  readonly heredocs: HeredocBody[];
}

/**
 * The commands of `text`, in order, without nested ones. The body of a here-document is input
 * data, not commands: a `'` in it (`Don't edit`) opened a quote to the end of the text, and
 * every command after it was lost.
 */
function topLevelCommands(text: string, indent: number): TopLevel {
  const commands: ShellWord[][] = [[]];
  const heredocs: HeredocBody[] = [];
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
      commands.push([]);
      index++;
    } else {
      const word = readWord(text, index);
      commands.at(-1)?.push(word);
      index = word.end;
    }
  }
  return { commands, heredocs };
}

/**
 * Reserved words (POSIX 2.4, and bash's `[[`) that open or close a compound command and are
 * followed by a command: `if a; then b; fi`, `while a; do b; done`, `! a`, `{ a; }`. They are
 * reserved only where a command name can stand, and only unquoted, so `echo then` and `"if"` stay
 * words. `time` is a launcher (domain/command-launchers.ts), as it takes options.
 */
const COMMAND_PREFIX_WORDS: ReadonlySet<string> = new Set([
  "if",
  "then",
  "elif",
  "else",
  "fi",
  "while",
  "until",
  "do",
  "done",
  "!",
  "{",
  "}",
  "esac",
]);
/**
 * Reserved words whose words up to the next separator are not a command: `for NAME in WORDS`,
 * `select NAME in WORDS`, `case WORD in`, and a `[[ … ]]` test.
 */
const CLAUSE_WORDS: ReadonlySet<string> = new Set(["for", "select", "case", "[["]);
/** `function NAME` (bash, ksh): the function's body, a compound command, follows the name. */
const FUNCTION_WORD = "function";
const FUNCTION_HEADER_LENGTH = 2;

const isReserved = (word: ShellWord | undefined, words: ReadonlySet<string>): boolean =>
  word !== undefined && word.raw === word.value && words.has(word.value);

/** How many words at `index` are a reserved word or a function header, before a command. */
function prefixLength(words: readonly ShellWord[], index: number): number {
  if (isReserved(words[index], COMMAND_PREFIX_WORDS)) {
    return 1;
  }
  const word = words[index];
  return word?.raw === FUNCTION_WORD ? FUNCTION_HEADER_LENGTH : 0;
}

/**
 * The simple command that a list of words between two separators holds, without the reserved
 * words in front of it: `then a b` is the command `a b`, and `for x in a b` is none.
 */
function simpleCommand(words: readonly ShellWord[]): ShellWord[] {
  let first = 0;
  for (let length = prefixLength(words, 0); length > 0; length = prefixLength(words, first)) {
    first += length;
  }
  return isReserved(words[first], CLAUSE_WORDS) ? [] : words.slice(first);
}

const QUOTES: ReadonlySet<string> = new Set(["'", '"']);
/** A quoted word with more than one word in it may be a command (`sh -c "…"`, `concurrently`). */
const NESTED_COMMAND_RE = /[\s;&|()`]/;

/**
 * The text inside the quotes of a word that is one quoted string holding a command line. The
 * inner text is read as written, so its offsets map one to one onto the outer text.
 */
function nestedCommandText(word: ShellWord): string | undefined {
  const quote = word.raw[0] as string;
  const isOneQuotedString =
    QUOTES.has(quote) &&
    word.raw.length > 1 &&
    word.raw.endsWith(quote) &&
    wordPart(word.raw, 0).end === word.raw.length;
  return isOneQuotedString && NESTED_COMMAND_RE.test(word.value)
    ? word.raw.slice(1, -1)
    : undefined;
}

/** Shells that run the script a here-document gives them, and Docker's `RUN <<EOF`. */
const SCRIPT_READERS: ReadonlySet<string> = new Set([
  "sh",
  "bash",
  "dash",
  "ash",
  "zsh",
  "ksh",
  "RUN",
]);
const PATH_SEPARATOR = "/";

/**
 * Whether a command runs the here-document it reads as a script: a shell or `RUN` with options
 * only (`bash -e <<EOF`, `RUN --mount=… <<EOF`). Any other command reads it as data (`cat`).
 */
function readsScript(command: ShellCommand): boolean {
  const [program, ...rest] = command;
  const name = program?.value.split(PATH_SEPARATOR).at(-1) ?? "";
  return SCRIPT_READERS.has(name) && rest.every((word) => word.value.startsWith("-"));
}

/** Moves the offsets of words found in a part of a text to offsets in the whole text. */
const shifted = (words: readonly ShellWord[], offset: number): ShellWord[] =>
  words.map((word) => ({ ...word, start: word.start + offset, end: word.end + offset }));

/** The commands of `text`, which starts at `offset` of a larger text, by offsets in that one. */
export function shellCommandsAt(text: string, offset: number, indent = 0): ShellCommand[] {
  return shellCommands(text, indent).map((words) => shifted(words, offset));
}

/**
 * The commands of `text`, in order of their first word. A quoted word that holds a command line
 * is read as commands too, so `sh -c "openapi-typescript a.yaml"` and `concurrently "…"` count.
 * `indent` is the number of spaces at the start of each line that the shell does not see, such as
 * the indentation of a YAML block scalar: a here-document delimiter line may have them.
 */
export function shellCommands(text: string, indent = 0): ShellCommand[] {
  const { commands: topLevel, heredocs } = topLevelCommands(text, indent);
  const commands: ShellCommand[] = [];
  for (const [index, words] of topLevel.entries()) {
    const command = simpleCommand(words);
    if (command.length > 0) {
      commands.push(command);
    }
    for (const word of command) {
      const inner = nestedCommandText(word);
      if (inner !== undefined) {
        const nested = shellCommands(inner).map((found) => shifted(found, word.start + 1));
        commands.push(...nested);
      }
    }
    const scripts = heredocs.filter((body) => body.command === index && readsScript(command));
    commands.push(...scripts.flatMap((body) => shellCommandsAt(body.text, body.start, indent)));
  }
  return commands;
}
