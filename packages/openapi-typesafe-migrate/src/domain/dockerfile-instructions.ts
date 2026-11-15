import { readBodies } from "./here-documents.js";
import { openHeredocs } from "./shell-words.js";
import type { PlacedText } from "./word-places.js";

/**
 * The instructions of a Dockerfile as Docker's parser reads them, before any instruction reads its
 * arguments: an escape character at the end of a line (`\`, or the one the `# escape=` parser
 * directive sets, "`" in Windows images) continues the instruction on the next line, the escape
 * and the line break taken off; empty and comment lines inside a continued instruction are left
 * out; and the here-document bodies of `RUN`, `COPY` and `ADD` follow their line. Each
 * instruction is one text, each character placed where it is written, so every instruction, in
 * shell or exec form, reads its words by one rule whatever the escape character.
 */

const DEFAULT_ESCAPE = "\\";
/** A parser directive: `# name=value` on one of the first lines, before anything else. */
const DIRECTIVE_RE = /^#[ \t]*([A-Za-z]+)[ \t]*=[ \t]*(\S+)[ \t]*$/;
const ESCAPE_DIRECTIVE = "escape";
const LINE_BREAK = "\n";
const CARRIAGE_RETURN = "\r";
const COMMENT = "#";
const KEYWORD_RE = /^[ \t]*(\S+)/;
/** The instructions that Docker gives here-documents to. */
const HEREDOC_INSTRUCTIONS: ReadonlySet<string> = new Set(["RUN", "COPY", "ADD"]);

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

/** One instruction: its keyword as written (`RUN`), and its text from the start of its line. */
export interface DockerInstruction {
  readonly keyword: string;
  readonly text: PlacedText;
}

/** A line of the file: where it starts and where its text ends, before its line break. */
interface Line {
  readonly start: number;
  readonly end: number;
}

function linesOf(text: string): Line[] {
  const lines: Line[] = [];
  for (let start = 0; start < text.length; ) {
    const lineBreak = text.indexOf(LINE_BREAK, start);
    const end = lineBreak === -1 ? text.length : lineBreak;
    lines.push({ start, end: text[end - 1] === CARRIAGE_RETURN ? end - 1 : end });
    start = end + 1;
  }
  return lines;
}

/** Whether a line holds no instruction text: only blanks, or a comment. */
const isSkipped = (text: string, { start, end }: Line): boolean => {
  const content = text.slice(start, end).trim();
  return content === "" || content.startsWith(COMMENT);
};

/** Where the escape that continues a line is, or undefined when the line is not continued. */
function continuationAt(
  text: string,
  { start, end }: Line,
  escapeMark: string,
): number | undefined {
  const content = text.slice(start, end).trimEnd();
  return content.endsWith(escapeMark) ? start + content.length - escapeMark.length : undefined;
}

/** A text being built from parts of the file, each character with its offset. */
interface TextBuilder {
  text: string;
  readonly offsets: number[];
}

function append(builder: TextBuilder, text: string, start: number, end: number): void {
  builder.text += text.slice(start, end);
  for (let at = start; at < end; at++) {
    builder.offsets.push(at);
  }
}

/** The instruction that starts at line `first`, and the index of the line after it. */
function instructionAt(text: string, lines: readonly Line[], first: number, escapeMark: string) {
  const builder: TextBuilder = { text: "", offsets: [] };
  let index = first;
  for (;;) {
    const line = lines[index] as Line;
    const escapeAt = continuationAt(text, line, escapeMark);
    append(builder, text, line.start, escapeAt ?? line.end);
    index++;
    while (
      escapeAt !== undefined &&
      index < lines.length &&
      isSkipped(text, lines[index] as Line)
    ) {
      index++;
    }
    if (escapeAt === undefined || index >= lines.length) {
      return { builder, next: index };
    }
  }
}

/** The line index that holds `offset`, from `from` on. */
function lineIndexAt(lines: readonly Line[], from: number, offset: number): number {
  const found = lines.findIndex((line, index) => index >= from && line.start >= offset);
  return found === -1 ? lines.length : found;
}

/** Adds the here-document bodies that an instruction opens; the index of the line after them. */
function withBodies(text: string, lines: readonly Line[], read: ReturnType<typeof instructionAt>) {
  const keyword = KEYWORD_RE.exec(read.builder.text)?.[1] ?? "";
  const pending = HEREDOC_INSTRUCTIONS.has(keyword) ? openHeredocs(read.builder.text) : [];
  const bodyStart = lines[read.next]?.start;
  if (pending.length === 0 || bodyStart === undefined) {
    return { keyword, next: read.next };
  }
  const { end } = readBodies(text, bodyStart, pending);
  // The line break after the instruction's line belongs to it, so the shell sees the bodies.
  append(read.builder, text, (lines[read.next - 1] as Line).end, end);
  return { keyword, next: lineIndexAt(lines, read.next, end) };
}

/** The instructions of a Dockerfile, in order; comment lines and parser directives are none. */
export function dockerInstructions(text: string): DockerInstruction[] {
  const escapeMark = escapeCharacter(text);
  const lines = linesOf(text);
  const instructions: DockerInstruction[] = [];
  for (let index = 0; index < lines.length; ) {
    if (isSkipped(text, lines[index] as Line)) {
      index++;
      continue;
    }
    const read = instructionAt(text, lines, index, escapeMark);
    const { keyword, next } = withBodies(text, lines, read);
    instructions.push({ keyword, text: read.builder });
    index = next;
  }
  return instructions;
}
