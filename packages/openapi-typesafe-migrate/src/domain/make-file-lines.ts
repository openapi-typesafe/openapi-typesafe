import { withoutMakeText } from "./make-assignments.js";
import { evaluatedText } from "./make-evaluations.js";
import type { FunctionCall } from "./make-expansions.js";
import type { TextRange } from "./make-line-text.js";
import { type MakeLines, readMakeLines } from "./make-lines.js";
import { makeTargets } from "./make-rules.js";
import type { MakeFile } from "./make-values.js";

/**
 * The lines of a Makefile read with the text that `$(eval …)` reads, as make reads them, and the
 * input of its values (make-values.ts). Both the migration of a Makefile and the values of an
 * `include` line's variables (make-include-words.ts) read a Makefile so.
 */

/** A Makefile's joined text, and where the text of another file starts in it. */
export interface MakefileText {
  readonly text: string;
  readonly fileStarts: ReadonlySet<number>;
}

/** The lines of a Makefile with the evaluated text, and the text without make's own. */
export interface AllLines {
  readonly lines: MakeLines;
  readonly plain: string;
  readonly calls: readonly FunctionCall[];
  readonly expanded: readonly TextRange[];
}

/** The lines of a Makefile with the text `$(eval …)` reads, and the text without make's own. */
export function allLines({ text, fileStarts }: MakefileText): AllLines {
  const lines = readMakeLines(text, { fileStarts });
  const plain = withoutMakeText(text, lines);
  const evaluated = evaluatedText(text, plain, lines);
  const assignments = [...lines.assignments, ...evaluated.lines.assignments].sort(
    (left, right) => left.start - right.start,
  );
  const hidden = [...lines.hidden, ...evaluated.lines.hidden];
  const { calls, expanded } = evaluated;
  return { lines: { ...lines, assignments, hidden }, plain, calls, expanded };
}

/** What make reads of a Makefile's values: the lines become the input of make-values.ts. */
export const makeFile = (lines: MakeLines): MakeFile => ({
  assignments: lines.assignments,
  conditionals: lines.conditionals,
  unreadIncludes: lines.includes,
  targets: makeTargets(lines.rules),
});
