import { assertNever } from "../../domain/assert-never.js";
import type { IrComment } from "../../domain/ir/nodes.js";
import { isLineBreak, type TextWriter } from "./text-writer.js";

const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/** Single-line white space as the TypeScript scanner defines it (`isWhiteSpaceSingleLine`). */
const SINGLE_LINE_WHITESPACE = new Set([
  0x20, 0x09, 0x0b, 0x0c, 0xa0, 0x85, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005,
  0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x200b, 0x202f, 0x205f, 0x3000, 0xfeff,
]);
const TAB = 0x09;

/** Start offsets of every line, splitting at CR LF, CR, LF, U+2028 and U+2029 like TypeScript. */
function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let position = 0; position < text.length; position++) {
    const code = text.charCodeAt(position);
    if (code === CARRIAGE_RETURN && text.charCodeAt(position + 1) === LINE_FEED) {
      position++;
    }
    if (isLineBreak(code)) {
      starts.push(position + 1);
    }
  }
  return starts;
}

/** Leading white space width of `text[start, end)`, counting a tab up to the next tab stop. */
function measureIndent(text: string, start: number, end: number, tabSize: number): number {
  let width = 0;
  for (
    let position = start;
    position < end && SINGLE_LINE_WHITESPACE.has(text.charCodeAt(position));
    position++
  ) {
    width += text.charCodeAt(position) === TAB ? tabSize - (width % tabSize) : 1;
  }
  return width;
}

/** Write the line `text[start, end)` trimmed; a blank line becomes a bare line break. */
function writeTrimmedLine(writer: TextWriter, text: string, start: number, end: number): void {
  const lineEnd = Math.min(text.length, end - 1);
  const line = text.substring(start, lineEnd).trim();
  if (line.length === 0) {
    writer.rawWrite(writer.options.newLine);
    return;
  }
  writer.write(line);
  if (lineEnd !== text.length) {
    writer.writeLine();
  }
}

/**
 * Write a `/*...*\/` comment the way the TypeScript printer writes a synthesized one: every line
 * after the first is re-indented to the current level plus the line's own leading white space, and
 * every line is trimmed. (TypeScript only does this for comments whose second character is `*`,
 * which is always true for a synthesized block comment, so there is no other branch.)
 */
function writeBlockComment(writer: TextWriter, body: string): void {
  const text = `/*${body}*/`;
  const lineStarts = computeLineStarts(text);
  const { indentSize } = writer.options;
  lineStarts.forEach((start, line) => {
    const end = line + 1 === lineStarts.length ? text.length + 1 : (lineStarts[line + 1] as number);
    if (line > 0) {
      const spaces = writer.indent * indentSize + measureIndent(text, start, end, indentSize);
      writer.rawWrite(" ".repeat(spaces));
    }
    writeTrimmedLine(writer, text, start, end);
  });
}

/** Write a comment on its own line before the node it belongs to. */
export function writeLeadingComment(writer: TextWriter, comment: IrComment): void {
  switch (comment.kind) {
    case "block":
      writeBlockComment(writer, comment.text);
      break;
    case "line":
      writer.writeLine();
      writer.write(`//${comment.text}`);
      break;
    default:
      assertNever(comment);
  }
  writer.writeLine();
}
