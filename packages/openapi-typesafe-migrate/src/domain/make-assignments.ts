import type { TextRange } from "./make-line-text.js";
import type { MakeAssignment, MakeLines } from "./make-lines.js";

/**
 * What the shell reads of a Makefile, and which variables make gives the programs a recipe runs.
 * The shell reads recipes and the values of assignments, which can hold a command; make's own
 * text (comments, directives, `NAME :=`) is blanked out, keeping every offset and line break.
 */

/** The special target that exports every variable. */
const EXPORT_ALL_TARGET = ".EXPORT_ALL_VARIABLES";
const NOT_LINE_BREAK_RE = /[^\n]/g;
const BLANK = " ";

/** The text with `ranges` blanked, in order, each one kept to the part after the previous one. */
export function blanked(text: string, ranges: readonly TextRange[]): string {
  const parts: string[] = [];
  let copiedUpTo = 0;
  for (const { start, end } of [...ranges].sort((left, right) => left.start - right.start)) {
    const from = Math.max(start, copiedUpTo);
    if (from >= end) {
      continue;
    }
    parts.push(
      text.slice(copiedUpTo, from),
      text.slice(from, end).replace(NOT_LINE_BREAK_RE, BLANK),
    );
    copiedUpTo = end;
  }
  parts.push(text.slice(copiedUpTo));
  return parts.join("");
}

/** The text without the comments and directives of make, which hold no command. */
export const withoutMakeText = (text: string, lines: Pick<MakeLines, "hidden">): string =>
  blanked(text, lines.hidden);

/** The text as the shell reads it: also the `NAME :=` of each assignment blanked. */
export const shellText = (text: string, lines: Pick<MakeLines, "hidden" | "assignments">): string =>
  blanked(text, [
    ...lines.hidden,
    ...lines.assignments.map(({ start, valueStart }) => ({ start, end: valueStart })),
  ]);

/**
 * Whether make gives the variable `name` to the programs its recipes run: an `export`
 * assignment or line names it, or a bare `export` or `.EXPORT_ALL_VARIABLES` exports all, and no
 * later `unexport` takes it back.
 */
export function isExported(lines: MakeLines, name: string): boolean {
  const events = lines.exports.flatMap(({ start, isExport, names }) =>
    names.length === 0 || names.includes(name) ? [{ start, isExport }] : [],
  );
  const own = lines.assignments
    .filter((assignment: MakeAssignment) => assignment.name === name && assignment.isExport)
    .map(({ start }) => ({ start, isExport: true }));
  const last = [...events, ...own].sort((left, right) => left.start - right.start).at(-1);
  return last === undefined
    ? lines.rules.some(({ targets }) => targets.includes(EXPORT_ALL_TARGET))
    : last.isExport;
}
