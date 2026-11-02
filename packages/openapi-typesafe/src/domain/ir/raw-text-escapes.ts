/**
 * Escapes for document text that the transformer writes into raw type text (threat model,
 * docs/security/threat-model.md). Without them, a name or path from the document could end the
 * literal early and add its own code to the generated file. Only the characters that would end or
 * change the literal are escaped, so output for every other name stays byte-identical.
 */

/** Line terminators end a single-quoted string; TypeScript reads U+2028 and U+2029 as such too. */
const SINGLE_QUOTED_ESCAPES: ReadonlyMap<string, string> = new Map([
  ["\\", "\\\\"],
  ["'", "\\'"],
  ["\n", "\\n"],
  ["\r", "\\r"],
  ["\u2028", "\\u2028"],
  ["\u2029", "\\u2029"],
]);
const SINGLE_QUOTED_SPECIAL_RE = /[\\'\n\r\u2028\u2029]/g;

/** The text between the quotes of a single-quoted string literal with this value. */
export function escapeSingleQuotedText(value: string): string {
  return value.replace(SINGLE_QUOTED_SPECIAL_RE, (char) => SINGLE_QUOTED_ESCAPES.get(char) ?? char);
}

/**
 * A backslash, a backtick, or the `${` that would start a placeholder. A raw carriage return is
 * read as a line feed inside a template literal, so it is written as an escape.
 */
const TEMPLATE_SPECIAL_RE = /\\|`|\$\{|\r/g;

function escapeTemplateSpecial(special: string): string {
  return special === "\r" ? "\\r" : `\\${special}`;
}

/** Template literal text (between placeholders) that reads back as exactly this value. */
export function escapeTemplateText(value: string): string {
  return value.replace(TEMPLATE_SPECIAL_RE, escapeTemplateSpecial);
}
