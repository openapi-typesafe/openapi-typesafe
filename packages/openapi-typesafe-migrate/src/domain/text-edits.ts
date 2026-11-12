import { MigrationBugError } from "./migration-bug.js";

/**
 * Edits by offset into the original text. A migration changes only the names, specs and command
 * words it renames, so everything else stays byte for byte: formatting, comments, key order,
 * number spellings, escapes and duplicate keys.
 */
export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * The text with the edits applied. Edits that overlap cannot both apply: that is a bug of the
 * migration that made them, and applying them would corrupt the file.
 */
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((left, right) => left.start - right.start);
  let edited = "";
  let copiedUpTo = 0;
  for (const edit of sorted) {
    if (edit.start < copiedUpTo) {
      throw new MigrationBugError(`edits overlap at offset ${edit.start}`);
    }
    edited += `${text.slice(copiedUpTo, edit.start)}${edit.text}`;
    copiedUpTo = edit.end;
  }
  return edited + text.slice(copiedUpTo);
}
