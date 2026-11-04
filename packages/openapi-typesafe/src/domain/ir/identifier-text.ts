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

/**
 * The names TypeScript does not accept as a type alias name: reserved words, strict mode and
 * module reserved words, and predefined type names (`void`, `string`, …). Checked with the
 * TypeScript 6.0 compiler on `export type <name> = 1;` in a module.
 */
const RESERVED_TYPE_NAMES: ReadonlySet<string> = new Set(
  (
    "any as await bigint boolean break case catch class const continue debugger default delete " +
    "do else enum export extends false finally for function if implements import in instanceof " +
    "interface let never new null number object package private protected public return static " +
    "string super switch symbol this throw true try typeof undefined unknown var void while with " +
    "yield"
  ).split(" "),
);

/** Whether TypeScript rejects the text as the name of a type alias. */
export function isReservedTypeName(text: string): boolean {
  return RESERVED_TYPE_NAMES.has(text);
}
