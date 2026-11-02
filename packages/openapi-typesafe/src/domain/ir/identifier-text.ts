/**
 * Identifier rules of ECMAScript (Unicode `ID_Start` / `ID_Continue`, plus `$`, `_`, ZWNJ and
 * ZWJ), for names built from document text.
 */

const IDENTIFIER_START_RE = /^[\p{ID_Start}$_]/u;
const INVALID_IDENTIFIER_PART_RE = /[^\p{ID_Continue}$‌‍]/gu;

/** Whether the text starts with a character that may start an identifier. */
export function hasIdentifierStart(text: string): boolean {
  return IDENTIFIER_START_RE.test(text);
}

/** The text with each character that cannot be part of an identifier replaced by `_`. */
export function withIdentifierParts(text: string): string {
  return text.replace(INVALID_IDENTIFIER_PART_RE, "_");
}
