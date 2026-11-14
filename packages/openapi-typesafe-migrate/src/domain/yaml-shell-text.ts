import type { DocumentString } from "./config-documents.js";
import { type VariableReferences, withVariableReferences } from "./yaml-environments.js";

/** A line break between two lines with text; a blank line between them stays a line break. */
const FOLDED_LINE_BREAK_RE = /(?<=\S[^\S\n]*)\n(?=[^\S\n]*\S)/g;

/**
 * The shell text of a value: where YAML folds a line break to a space, so does the shell text,
 * and a reference that the runner replaces is read as the variable it names. The replacements
 * keep the length, so offsets into it are offsets into the value as written.
 */
export function shellText(
  text: string,
  value: DocumentString,
  references?: VariableReferences,
): string {
  const slice = text.slice(value.content.start, value.content.end);
  const unfolded = value.isFolded ? slice.replace(FOLDED_LINE_BREAK_RE, " ") : slice;
  return withVariableReferences(unfolded, references);
}
