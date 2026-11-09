/**
 * Splits shell text (a package.json script, a line of a shell script, Makefile or CI step) into
 * simple commands, each a list of words with their offsets. It follows the POSIX shell rules that
 * decide where a word and a command end: quotes, backslash escapes, line continuations, comments
 * and the control operators. It does not expand anything, so it never runs or guesses a value.
 */

/** One word of a command. `start` and `end` are offsets of the word as written, quotes included. */
export interface ShellWord {
  readonly start: number;
  readonly end: number;
  /** The word after quote removal: `"a b"` is `a b`. */
  readonly value: string;
  /** The word as written: `"a b"` is `"a b"`. */
  readonly raw: string;
}

/** A simple command: the words between two control operators. */
export type ShellCommand = readonly ShellWord[];

/** Characters that end a command: `;`, `&`, `|`, subshells and command substitution. */
const COMMAND_SEPARATORS: ReadonlySet<string> = new Set([";", "&", "|", "(", ")", "`", "\n"]);
/** Characters that end a word without ending the command: blanks and redirections. */
const WORD_BREAKS: ReadonlySet<string> = new Set([" ", "\t", "\r", "<", ">"]);
const BACKSLASH = "\\";
const COMMENT = "#";
/** Inside double quotes a backslash escapes only these characters (POSIX 2.2.3). */
const DOUBLE_QUOTE_ESCAPES: ReadonlySet<string> = new Set(["$", "`", '"', BACKSLASH, "\n"]);

/** A quoted part of a word: where it ends (after the closing quote) and its value. */
interface QuotedPart {
  readonly end: number;
  readonly value: string;
}

/** A single-quoted part starting at `start`: everything up to the next `'` is literal. */
function singleQuoted(text: string, start: number): QuotedPart {
  const close = text.indexOf("'", start + 1);
  const end = close === -1 ? text.length : close + 1;
  return { end, value: text.slice(start + 1, close === -1 ? text.length : close) };
}

/** A double-quoted part starting at `start`, with its backslash escapes resolved. */
function doubleQuoted(text: string, start: number): QuotedPart {
  let value = "";
  let index = start + 1;
  while (index < text.length && text[index] !== '"') {
    const next = text[index + 1] ?? "";
    const isEscape = text[index] === BACKSLASH && DOUBLE_QUOTE_ESCAPES.has(next);
    value += isEscape ? (next === "\n" ? "" : next) : text[index];
    index += isEscape ? 2 : 1;
  }
  return { end: Math.min(index + 1, text.length), value };
}

const isLineContinuation = (text: string, index: number): boolean =>
  text[index] === BACKSLASH && (text[index + 1] === "\n" || text.startsWith("\r\n", index + 1));

/** The part of a word that starts at `index`: a quoted string, an escape or one character. */
function wordPart(text: string, index: number): QuotedPart {
  const char = text[index] as string;
  if (char === "'") {
    return singleQuoted(text, index);
  }
  if (char === '"') {
    return doubleQuoted(text, index);
  }
  if (char === BACKSLASH && index + 1 < text.length) {
    return { end: index + 2, value: text[index + 1] as string };
  }
  return { end: index + 1, value: char };
}

const endsWord = (text: string, index: number): boolean => {
  const char = text[index] as string;
  return WORD_BREAKS.has(char) || COMMAND_SEPARATORS.has(char) || isLineContinuation(text, index);
};

/** The word that starts at `start` (not a blank, separator or comment). */
function readWord(text: string, start: number): ShellWord {
  let value = "";
  let index = start;
  while (index < text.length && !endsWord(text, index)) {
    const part = wordPart(text, index);
    value += part.value;
    index = part.end;
  }
  return { start, end: index, value, raw: text.slice(start, index) };
}

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

/** The commands of `text`, in order, without nested ones. */
function topLevelCommands(text: string): ShellWord[][] {
  const commands: ShellWord[][] = [[]];
  let index = 0;
  while (index < text.length) {
    const afterTrivia = skipTrivia(text, index);
    if (afterTrivia !== index) {
      index = afterTrivia;
    } else if (COMMAND_SEPARATORS.has(text[index] as string)) {
      commands.push([]);
      index++;
    } else {
      const word = readWord(text, index);
      commands.at(-1)?.push(word);
      index = word.end;
    }
  }
  return commands.filter((words) => words.length > 0);
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

/** Moves the offsets of words found in a part of a text to offsets in the whole text. */
const shifted = (words: readonly ShellWord[], offset: number): ShellWord[] =>
  words.map((word) => ({ ...word, start: word.start + offset, end: word.end + offset }));

/**
 * The commands of `text`, in order of their first word. A quoted word that holds a command line
 * is read as commands too, so `sh -c "openapi-typescript a.yaml"` and `concurrently "…"` count.
 */
export function shellCommands(text: string): ShellCommand[] {
  const commands: ShellCommand[] = [];
  for (const command of topLevelCommands(text)) {
    commands.push(command);
    for (const word of command) {
      const inner = nestedCommandText(word);
      if (inner !== undefined) {
        const nested = shellCommands(inner).map((words) => shifted(words, word.start + 1));
        commands.push(...nested);
      }
    }
  }
  return commands;
}
