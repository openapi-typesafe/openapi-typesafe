/**
 * The text of a Makefile line as GNU make scans it (read.c): logical lines that a backslash
 * continues, the `#` that starts a comment, the words between blanks, and the variable
 * definitions (`NAME := value`). Make skips the text of a reference (`$(…)`, `${…}`) when it
 * looks for a `:` or an `=`, so `$(subst :,=,$(X))` is one word.
 */

const LINE_BREAK = "\n";
const BACKSLASH = "\\";
const COMMENT = "#";
const DOLLAR = "$";
const BLANKS: ReadonlySet<string> = new Set([" ", "\t"]);
const CLOSING: Readonly<Record<string, string>> = { "(": ")", "{": "}" };

/** A part of a text: from `start` up to, not including, `end`. */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

/** A word of a line and where it starts. */
export interface MakeWord {
  readonly text: string;
  readonly start: number;
}

export const isBlank = (char: string | undefined): boolean =>
  char !== undefined && BLANKS.has(char);

/** Whether the character at `index` follows an odd number of backslashes, which escape it. */
function isEscaped(text: string, from: number, index: number): boolean {
  let count = 0;
  for (let at = index - 1; at >= from && text[at] === BACKSLASH; at--) {
    count++;
  }
  return count % 2 === 1;
}

/** Where the logical line that starts at `start` ends, before `limit`: a `\` continues it. */
export function logicalLineEnd(text: string, start: number, limit: number): number {
  let end = text.indexOf(LINE_BREAK, start);
  while (end !== -1 && end < limit && isEscaped(text, start, end)) {
    end = text.indexOf(LINE_BREAK, end + 1);
  }
  return end === -1 || end > limit ? limit : end;
}

/** Where the comment of a line starts (a `#` that no backslash escapes), or `end` for none. */
export function commentStart(text: string, start: number, end: number): number {
  for (let index = text.indexOf(COMMENT, start); index !== -1 && index < end; ) {
    if (!isEscaped(text, start, index)) {
      return index;
    }
    index = text.indexOf(COMMENT, index + 1);
  }
  return end;
}

/** The first index at or after `from` that is not a blank, or `end`. */
export function skipBlanks(text: string, from: number, end: number): number {
  let index = from;
  while (index < end && isBlank(text[index])) {
    index++;
  }
  return index;
}

/** Where the reference that starts with the `$` at `index` ends, or `index + 1` for `$$`, `$X`. */
export function referenceEnd(text: string, index: number, end: number): number {
  const open = text[index + 1] ?? "";
  const close = CLOSING[open];
  if (close === undefined) {
    return Math.min(index + 2, end);
  }
  let depth = 0;
  for (let at = index + 1; at < end; at++) {
    if (text[at] === open) {
      depth++;
    } else if (text[at] === close && --depth === 0) {
      return at + 1;
    }
  }
  return end;
}

/** The first index of one of `chars` outside references, from `from` up to `end`, or -1. */
export function findOutsideReferences(
  text: string,
  range: TextRange,
  chars: ReadonlySet<string>,
): number {
  for (let index = range.start; index < range.end; ) {
    const char = text[index] as string;
    if (char === DOLLAR) {
      index = referenceEnd(text, index, range.end);
    } else if (chars.has(char)) {
      return index;
    } else {
      index++;
    }
  }
  return -1;
}

/** The words of a part of a line, split at blanks outside references. */
export function makeWords(text: string, { start, end }: TextRange): MakeWord[] {
  const words: MakeWord[] = [];
  let index = skipBlanks(text, start, end);
  while (index < end) {
    const wordStart = index;
    while (index < end && !isBlank(text[index])) {
      index = text[index] === DOLLAR ? referenceEnd(text, index, end) : index + 1;
    }
    words.push({ text: text.slice(wordStart, index), start: wordStart });
    index = skipBlanks(text, index, end);
  }
  return words;
}
