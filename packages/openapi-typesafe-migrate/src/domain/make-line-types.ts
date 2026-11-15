import type { MakeAssignmentHead } from "./make-definitions.js";
import type { MakeWord, TextRange } from "./make-line-text.js";

/** What make reads of a Makefile's lines (make-lines.ts), and the state of the reading. */

/** A variable assignment: the variable, its operator and modifiers, where its value is. */
export interface MakeAssignment {
  readonly name: string;
  readonly operator: string;
  readonly start: number;
  readonly valueStart: number;
  readonly valueEnd: number;
  /** The targets an assignment for some targets only sets the variable for. */
  readonly targets: readonly string[] | undefined;
  readonly isOverride: boolean;
  readonly isExport: boolean;
  readonly isPrivate: boolean;
  /** In text that `$(eval …)` reads: make runs it where it expands the call, not in order. */
  readonly isEvaluated: boolean;
}

/** A conditional directive: where it is, and whether it opens, continues or closes a block. */
export interface MakeConditional {
  readonly start: number;
  readonly kind: "if" | "else" | "else-if" | "endif";
}

/** A rule: its targets, its prerequisites, and its recipe (an inline one and recipe lines). */
export interface MakeRule {
  readonly start: number;
  readonly end: number;
  readonly targets: readonly string[];
  readonly prerequisites: readonly string[];
  readonly recipes: readonly TextRange[];
}

/** `export NAME …` or `unexport NAME …` without a value: a list of names, or all variables. */
export interface MakeExportLine {
  readonly start: number;
  readonly isExport: boolean;
  readonly names: readonly string[];
}

/** An `include` directive (also `-include`, `sinclude`) and the files it names, as written. */
export interface MakeInclude extends TextRange {
  readonly paths: readonly MakeWord[];
}

/** What make reads of a Makefile; `hidden` is make's own text (comments, directives). */
export interface MakeLines {
  readonly assignments: MakeAssignment[];
  readonly conditionals: MakeConditional[];
  readonly rules: MakeRule[];
  readonly exports: MakeExportLine[];
  readonly includes: MakeInclude[];
  readonly hidden: TextRange[];
}

/** Which part of a text to read: `fileStarts` are where the text of another file starts. */
export interface MakeReadOptions {
  readonly from?: number;
  readonly to?: number;
  readonly fileStarts?: ReadonlySet<number>;
  readonly isEvaluated?: boolean;
}

export interface Reader {
  readonly text: string;
  readonly to: number;
  readonly isEvaluated: boolean;
  readonly found: MakeLines;
  /** The recipe of the rule that the next tab-started line belongs to. */
  recipes: TextRange[] | undefined;
}

/** One logical line, and the part of it before its comment. */
export interface Line extends TextRange {
  readonly content: TextRange;
}

export const hideComment = (found: MakeLines, line: Line): void => {
  if (line.content.end < line.end) {
    found.hidden.push({ start: line.content.end, end: line.end });
  }
};

/** An assignment without targets, from its value's place. */
export function assignmentOf(
  reader: Reader,
  head: MakeAssignmentHead,
  fields: AssignmentFields,
): MakeAssignment {
  return {
    ...fields,
    isOverride: head.modifiers.has("override"),
    isExport: head.modifiers.has("export"),
    isPrivate: head.modifiers.has("private"),
    isEvaluated: reader.isEvaluated,
  };
}

export type AssignmentFields = Pick<
  MakeAssignment,
  "name" | "operator" | "start" | "valueStart" | "valueEnd" | "targets"
>;
