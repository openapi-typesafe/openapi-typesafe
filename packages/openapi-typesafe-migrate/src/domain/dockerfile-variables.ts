import type { ShellCommand } from "./shell-words.js";
import type { PlacedText } from "./word-places.js";

/**
 * The variables that `ARG` and `ENV` instructions of a Dockerfile set. Docker, not a shell, reads
 * them: it splits the instruction into words at blanks outside quotes and takes the quotes and
 * escapes off each word, with its escape character, `\` or the one the `# escape=` parser
 * directive sets (`# escape=` + "`" in Windows images). A later `RUN $GEN api.yaml` splits the
 * value into words again, so the value is read as a command line, each character placed where it
 * is written (word-places.ts).
 */

const DEFAULT_ESCAPE = "\\";
/** A parser directive: `# name=value` on one of the first lines, before anything else. */
const DIRECTIVE_RE = /^#[ \t]*([A-Za-z]+)[ \t]*=[ \t]*(\S+)[ \t]*$/;
const ESCAPE_DIRECTIVE = "escape";
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

/** The escape character of a Dockerfile, which its `escape` parser directive may set. */
export function escapeCharacter(text: string): string {
  for (const line of text.split(LINE_BREAK)) {
    const directive = DIRECTIVE_RE.exec(line.replace(CARRIAGE_RETURN, ""));
    if (directive === null) {
      return DEFAULT_ESCAPE;
    }
    if (directive[1]?.toLowerCase() === ESCAPE_DIRECTIVE) {
      return directive[2] as string;
    }
  }
  return DEFAULT_ESCAPE;
}

/** Where the instruction that holds `index` ends: an escape at the end of a line continues it. */
function instructionEnd(text: string, index: number, escapeMark: string): number {
  for (let end = text.indexOf(LINE_BREAK, index); end !== -1; ) {
    if (!text.slice(index, end).trimEnd().endsWith(escapeMark)) {
      return end;
    }
    index = end + 1;
    end = text.indexOf(LINE_BREAK, index);
  }
  return text.length;
}

/** A Docker word being read: its characters and where each is written. */
interface WordBuilder {
  value: string;
  readonly offsets: number[];
}

const add = (word: WordBuilder, text: string, index: number): void => {
  word.value += text[index];
  word.offsets.push(index);
};

/** Whether an escape at `index` continues the line: only blanks after it, then a line break. */
function isContinuation(text: string, index: number, escapeMark: string): boolean {
  const lineEnd = text.indexOf(LINE_BREAK, index);
  return (
    text[index] === escapeMark && lineEnd !== -1 && text.slice(index + 1, lineEnd).trim() === ""
  );
}

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
    if (isContinuation(text, at, escapeMark)) {
      at = text.indexOf(LINE_BREAK, at);
    } else {
      at += quote === DOUBLE_QUOTE && isQuotedEscape(text, at, escapeMark) ? 1 : 0;
      add(word, text, at);
    }
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
    if (isContinuation(text, index, escapeMark)) {
      index = text.indexOf(LINE_BREAK, index) + 1;
    } else if (BLANKS.has(text[index] as string) && (!isWhole || word.value === "")) {
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

/** An `ARG` or `ENV` instruction: where it is in the text, and the variables it sets. */
export interface VariableInstruction extends TextRange {
  readonly variables: readonly DockerVariable[];
}

/**
 * The `ARG` and `ENV` instructions that start the shell-form commands of a Dockerfile, each to
 * the end of its last continued line.
 */
export function variableInstructions(
  text: string,
  commands: readonly ShellCommand[],
): VariableInstruction[] {
  const escapeMark = escapeCharacter(text);
  return commands.flatMap(([keyword]): VariableInstruction[] => {
    if (keyword === undefined || !VARIABLE_INSTRUCTIONS.has(keyword.value)) {
      return [];
    }
    const range = { start: keyword.end, end: instructionEnd(text, keyword.end, escapeMark) };
    const variables = instructionVariables(text, keyword.value, range, escapeMark);
    return [{ start: keyword.start, end: range.end, variables }];
  });
}
