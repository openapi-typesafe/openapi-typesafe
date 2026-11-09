/** A replacement of the text between two offsets by new text. */
export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Apply edits that do not overlap, from the end of the text, so earlier offsets stay valid. Edits
 * that overlap would corrupt the text: that is a bug of the caller, so it throws.
 */
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((left, right) => right.start - left.start);
  let result = text;
  let limit = text.length;
  for (const edit of sorted) {
    if (edit.end > limit) {
      throw new Error(`Text edits overlap at offset ${edit.start}; the text was not changed.`);
    }
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    limit = edit.start;
  }
  return result;
}
