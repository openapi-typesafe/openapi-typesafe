import type { ShellWord } from "./shell-word-parts.js";
import { unquotedText } from "./shell-word-parts.js";

/**
 * Where the words of a text read again as a command line are written. A shell reads the value
 * of `GEN="npx "openapi-typescript` and the command line of `sh -c "…"` after quote removal, so
 * their words are read from that text, and each character of a word keeps the offset in the file
 * where it is written. A word whose characters are in one piece is edited where it is written;
 * an edit of characters that quotes or escapes split (`open"api"-typescript`) has no single
 * place, so it is not made, and the old name is reported.
 */

/** A text that is read as a command line, and the offset in the file of each character. */
export interface PlacedText {
  readonly text: string;
  readonly offsets: readonly number[];
}

/** The offset in the file of the character at `index` of a word's raw text. */
export const writtenOffset = (word: ShellWord, index: number): number =>
  word.written?.[index] ?? word.start + index;

/** The text of a word's raw characters from `from`, placed where they are written. */
export function rawText(word: ShellWord, from: number, text: string): PlacedText {
  return { text, offsets: Array.from(text, (_, index) => writtenOffset(word, from + index)) };
}

/**
 * The raw text of a word from `from` after quote removal, as the shell reads it, placed where
 * each character that the quotes and escapes keep is written.
 */
export function unquotedRawText(word: ShellWord, from: number): PlacedText {
  const { value, offsets } = unquotedText(word.raw.slice(from));
  return { text: value, offsets: offsets.map((index) => writtenOffset(word, from + index)) };
}

/** A word read from a placed text, placed in the file. */
export function placedWord(word: ShellWord, { offsets }: PlacedText): ShellWord {
  const written = Array.from(word.raw, (_, index) => {
    return offsets[writtenOffset(word, index)] as number;
  });
  const start = written[0] ?? (offsets[word.start] as number);
  const end = (written.at(-1) ?? start - 1) + 1;
  const isInOnePiece = written.every((offset, index) => offset === start + index);
  const placed = { start, end, value: word.value, raw: word.raw };
  return isInOnePiece ? placed : { ...placed, written };
}

/** A word found in a part of a text that starts at `offset` of the whole text. */
export function movedWord(word: ShellWord, offset: number): ShellWord {
  const moved = { ...word, start: word.start + offset, end: word.end + offset };
  return word.written === undefined
    ? moved
    : { ...moved, written: word.written.map((at) => at + offset) };
}

/** Where `length` characters of a word's raw text from `from` are written, in one piece. */
export function writtenSpan(
  word: ShellWord,
  from: number,
  length: number,
): { readonly start: number; readonly end: number } | undefined {
  const first = writtenOffset(word, from);
  const last = writtenOffset(word, from + length - 1);
  return last - first === length - 1 ? { start: first, end: last + 1 } : undefined;
}

/** Where the first `length` characters of a placed text are written, in one piece. */
export function placedSpan(
  { offsets }: PlacedText,
  length: number,
): { readonly start: number; readonly end: number } | undefined {
  const first = offsets[0];
  const last = offsets[length - 1];
  if (first === undefined || last === undefined || last - first !== length - 1) {
    return undefined;
  }
  return { start: first, end: last + 1 };
}
