/**
 * Text from a document or a project (a path key, an `operationId`, a file name) reaches the
 * terminal and CI job logs. A line break in it starts a new line that CI reads as a command
 * (`::error …` in GitHub Actions, `##vso[…]` in Azure Pipelines), and an escape sequence moves
 * the cursor or erases lines, so it can forge or hide output. Each such character is shown as an
 * escape instead (`\n`, `\u001b`), so one message stays one line and shows what the text holds.
 */

/**
 * The code points shown as escapes: C0 controls but the tab, DEL and C1 controls, the Unicode
 * line and paragraph separators, and the bidirectional controls, which reorder how a terminal
 * shows the text around them.
 */
const CONTROL_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x08],
  [0x0a, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x2029],
  [0x202a, 0x202e],
  [0x2066, 0x2069],
];

const SHORT_ESCAPES: Readonly<Record<string, string>> = { "\n": "\\n", "\r": "\\r" };
const HEX_DIGITS = 4;
const HEX_RADIX = 16;

function isControl(codePoint: number): boolean {
  return CONTROL_RANGES.some(([first, last]) => codePoint >= first && codePoint <= last);
}

function escapeOf(character: string, codePoint: number): string {
  const hex = codePoint.toString(HEX_RADIX).padStart(HEX_DIGITS, "0");
  return SHORT_ESCAPES[character] ?? `\\u${hex}`;
}

/** The text with every control character shown as an escape, so it prints as one plain line. */
export function terminalSafeText(text: string): string {
  let shown = "";
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    shown += isControl(codePoint) ? escapeOf(character, codePoint) : character;
  }
  return shown;
}
