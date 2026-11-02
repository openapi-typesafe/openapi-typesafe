import type { IrStringEncoding } from "../../domain/ir/nodes.js";

/**
 * Escapes TypeScript's printer uses inside a double-quoted string literal (its `escapeString`).
 * Other characters below U+0020 use `\uXXXX`; so does every non-ASCII code unit
 * (`escapeNonAsciiString`).
 */
const NAMED_ESCAPES: ReadonlyMap<number, string> = new Map([
  [0x09, "\\t"],
  [0x0b, "\\v"],
  [0x0c, "\\f"],
  [0x08, "\\b"],
  [0x0d, "\\r"],
  [0x0a, "\\n"],
  [0x5c, "\\\\"],
  [0x22, '\\"'],
]);
const NULL_CODE = 0x00;
const FIRST_PRINTABLE_ASCII = 0x20;
const LAST_ASCII = 0x7f;
const DIGIT_ZERO = 0x30;
const DIGIT_NINE = 0x39;

function toUtf16Escape(code: number): string {
  return `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

function isDigit(code: number): boolean {
  return code >= DIGIT_ZERO && code <= DIGIT_NINE;
}

/** `\0` must not be followed by a digit, or it would read as an octal escape. */
function escapeCodeUnit(code: number, nextCode: number): string {
  if (code === NULL_CODE) {
    return isDigit(nextCode) ? "\\x00" : "\\0";
  }
  const named = NAMED_ESCAPES.get(code);
  if (named !== undefined) {
    return named;
  }
  const isPlainAscii = code >= FIRST_PRINTABLE_ASCII && code <= LAST_ASCII;
  return isPlainAscii ? String.fromCharCode(code) : toUtf16Escape(code);
}

/** A double-quoted string literal as the TypeScript printer writes a synthesized one. */
export function printEscapedString(value: string): string {
  let escaped = "";
  for (let index = 0; index < value.length; index++) {
    escaped += escapeCodeUnit(value.charCodeAt(index), value.charCodeAt(index + 1));
  }
  return `"${escaped}"`;
}

/** A string literal in the given encoding (see `IrStringEncoding`). */
export function printStringLiteral(value: string, encoding: IrStringEncoding): string {
  return encoding === "json" ? JSON.stringify(value) : printEscapedString(value);
}

/** A number as the original writes it: the absolute value's `String()` text, with a minus sign. */
export function printNumberLiteral(value: number): string {
  return value < 0 ? `-${String(Math.abs(value))}` : String(value);
}
