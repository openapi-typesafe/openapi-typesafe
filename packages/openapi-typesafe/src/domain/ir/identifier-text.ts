import { NEWER_IDENTIFIER_PART, NEWER_IDENTIFIER_START } from "./newer-identifier-ranges.js";

/**
 * Identifier rules of ECMAScript (Unicode `ID_Start` / `ID_Continue`, plus `$`, `_`, ZWNJ and
 * ZWJ), for names built from document text, without the characters that TypeScript's scanner
 * does not know yet. Node.js follows a newer Unicode version than TypeScript's identifier tables,
 * so a name such as `꟒Name` (Unicode 17) passed here and failed to parse with "Invalid
 * character" (ADR-019). Removing the newer characters also gives the same names on every
 * supported Node.js version.
 */

const IDENTIFIER_START_RE = new RegExp(
  `^[[\\p{ID_Start}$_]--[${NEWER_IDENTIFIER_START.join("")}]]`,
  "v",
);
const INVALID_IDENTIFIER_PART_RE = new RegExp(
  `[^[\\p{ID_Continue}$\\u{200C}\\u{200D}]--[${NEWER_IDENTIFIER_PART.join("")}]]`,
  "gv",
);

/** Whether the text starts with a character that may start an identifier. */
export function hasIdentifierStart(text: string): boolean {
  return IDENTIFIER_START_RE.test(text);
}

/** The text with each character that cannot be part of an identifier replaced by `_`. */
export function withIdentifierParts(text: string): string {
  return text.replace(INVALID_IDENTIFIER_PART_RE, "_");
}
