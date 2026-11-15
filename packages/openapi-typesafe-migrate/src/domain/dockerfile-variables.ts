import type { DockerInstruction } from "./dockerfile-instructions.js";
import type { PlacedText } from "./word-places.js";

/**
 * The variables that `ARG` and `ENV` instructions of a Dockerfile set. Docker, not a shell, reads
 * them: it splits the instruction (its lines joined, dockerfile-instructions.ts) into words at
 * blanks outside quotes and takes the quotes and escapes off each word, with its escape
 * character, `\` or the one the `# escape=` parser directive sets. A later `RUN $GEN api.yaml`
 * splits the value into words again, so the value is read as a command line, each character
 * placed where it is written (word-places.ts).
 */

const LINE_BREAK = "\n";
const CARRIAGE_RETURN = "\r";
const BLANKS: ReadonlySet<string> = new Set([" ", "\t", CARRIAGE_RETURN, LINE_BREAK]);
const SINGLE_QUOTE = "'";
const DOUBLE_QUOTE = '"';
/** Inside double quotes the escape character escapes only these, and itself. */
const DOUBLE_QUOTE_ESCAPES: ReadonlySet<string> = new Set([DOUBLE_QUOTE, "$"]);
const ASSIGNMENT = "=";
const VARIABLE_INSTRUCTIONS: ReadonlySet<string> = new Set(["ARG", "ENV"]);
const LEGACY_ENV_INSTRUCTION = "ENV";
const KEYWORD_RE = /^[ \t]*\S+/;

/** A Docker word being read: its characters and where each is written. */
interface WordBuilder {
  value: string;
  readonly offsets: number[];
}

const add = (word: WordBuilder, text: string, index: number): void => {
  word.value += text[index];
  word.offsets.push(index);
};

/** Whether the character at `index` of a double-quoted part escapes the next one. */
function isQuotedEscape(text: string, index: number, escapeMark: string): boolean {
  const next = text[index + 1] ?? "";
  return text[index] === escapeMark && (DOUBLE_QUOTE_ESCAPES.has(next) || next === escapeMark);
}

/** Reads a quoted part at `index` into `word`; the index after it. */
function readQuoted(text: string, index: number, word: WordBuilder, escapeMark: string): number {
  const quote = text[index];
  let at = index + 1;
  for (; at < text.length && text[at] !== quote; at++) {
    at += quote === DOUBLE_QUOTE && isQuotedEscape(text, at, escapeMark) ? 1 : 0;
    add(word, text, at);
  }
  return at + 1;
}

/**
 * Reads the part of a word at `index` into `word`: a quoted string, an escaped character or one
 * character; the index after it. Docker itself expands a `${GEN:-npx openapi-typescript}` in
 * the value when it builds, after it takes the escapes off, so the expansion is read as any
 * other text, and a later shell reads it again as an expansion.
 */
function readPart(text: string, index: number, word: WordBuilder, escapeMark: string): number {
  const char = text[index] as string;
  if (char === SINGLE_QUOTE || char === DOUBLE_QUOTE) {
    return readQuoted(text, index, word, escapeMark);
  }
  const end = index + (char === escapeMark && index + 1 < text.length ? 2 : 1);
  add(word, text, end - 1);
  return end;
}

/** A word that ends, given to `words` when it has characters; a new word to read. */
function endWord(word: WordBuilder, words: PlacedText[]): WordBuilder {
  const value = word.value.trimEnd();
  if (value !== "") {
    words.push({ text: value, offsets: word.offsets.slice(0, value.length) });
  }
  return { value: "", offsets: [] };
}

/**
 * The words of an instruction in `range`, quotes and escapes taken off; with `isWhole`, one word
 * from the first character that is not a blank to the end, blanks kept but the last ones.
 */
function dockerWords(text: string, range: TextRange, escapeMark: string, isWhole = false) {
  const words: PlacedText[] = [];
  const instruction = text.slice(0, range.end);
  let word: WordBuilder = { value: "", offsets: [] };
  for (let index = range.start; index < range.end; ) {
    if (BLANKS.has(text[index] as string) && (!isWhole || word.value === "")) {
      word = endWord(word, words);
      index++;
    } else {
      index = readPart(instruction, index, word, escapeMark);
    }
  }
  endWord(word, words);
  return words;
}

interface TextRange {
  readonly start: number;
  readonly end: number;
}

/** A variable that `ARG` or `ENV` sets: its name, and its value placed where it is written. */
export interface DockerVariable {
  readonly name: string;
  readonly value: PlacedText;
}

/** The variable of one `NAME=value` word, or none: `ARG NAME` sets no value. */
function assignedVariable({ text, offsets }: PlacedText): DockerVariable[] {
  const at = text.indexOf(ASSIGNMENT);
  if (at <= 0) {
    return [];
  }
  return [
    {
      name: text.slice(0, at),
      value: { text: text.slice(at + 1), offsets: offsets.slice(at + 1) },
    },
  ];
}

/**
 * The variables of one instruction after its keyword: `ARG NAME=value`, `ENV NAME=value …`, and
 * `ENV NAME value`, the legacy form that sets one variable to the rest of the instruction.
 */
function instructionVariables(text: string, keyword: string, range: TextRange, escapeMark: string) {
  const [first, ...rest] = dockerWords(text, range, escapeMark);
  if (first === undefined) {
    return [];
  }
  if (keyword === LEGACY_ENV_INSTRUCTION && !first.text.includes(ASSIGNMENT)) {
    const valueStart = rest[0]?.offsets[0] ?? range.end;
    const [value] = dockerWords(text, { start: valueStart, end: range.end }, escapeMark, true);
    return [{ name: first.text, value: value ?? { text: "", offsets: [] } }];
  }
  return [first, ...rest].flatMap(assignedVariable);
}

/** Whether an instruction sets variables (`ARG`, `ENV`), which Docker reads, not a shell. */
export const isVariableInstruction = (keyword: string): boolean =>
  VARIABLE_INSTRUCTIONS.has(keyword);

/**
 * The variables that the `ARG` and `ENV` instructions of a Dockerfile set, in order, each value
 * placed where it is written in the file.
 */
export function dockerVariables(
  instructions: readonly DockerInstruction[],
  escapeMark: string,
): DockerVariable[] {
  return instructions.flatMap(({ keyword, text }) => {
    if (!isVariableInstruction(keyword)) {
      return [];
    }
    const range = { start: KEYWORD_RE.exec(text.text)?.[0].length ?? 0, end: text.text.length };
    return instructionVariables(text.text, keyword, range, escapeMark).map(({ name, value }) => ({
      name,
      value: { text: value.text, offsets: value.offsets.map((at) => text.offsets[at] as number) },
    }));
  });
}
