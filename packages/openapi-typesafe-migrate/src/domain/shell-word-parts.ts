/**
 * The words of shell text: where a word ends, and its value after quote removal (POSIX 2.2, 2.3).
 * shell-words.ts splits a text into commands of these words.
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
export const COMMAND_SEPARATORS: ReadonlySet<string> = new Set([
  ";",
  "&",
  "|",
  "(",
  ")",
  "`",
  "\n",
]);
/** Characters that end a word without ending the command: blanks and redirections. */
export const WORD_BREAKS: ReadonlySet<string> = new Set([" ", "\t", "\r", "<", ">"]);
const BACKSLASH = "\\";
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

export const isLineContinuation = (text: string, index: number): boolean =>
  text[index] === BACKSLASH && (text[index + 1] === "\n" || text.startsWith("\r\n", index + 1));

/** The part of a word that starts at `index`: a quoted string, an escape or one character. */
export function wordPart(text: string, index: number): QuotedPart {
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
export function readWord(text: string, start: number): ShellWord {
  let value = "";
  let index = start;
  while (index < text.length && !endsWord(text, index)) {
    const part = wordPart(text, index);
    value += part.value;
    index = part.end;
  }
  return { start, end: index, value, raw: text.slice(start, index) };
}
