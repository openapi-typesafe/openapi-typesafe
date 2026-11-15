import { assignmentHead, type MakeAssignmentHead } from "./make-definitions.js";
import { findOutsideReferences, makeWords, type TextRange } from "./make-line-text.js";
import { assignmentOf, hideComment, type Line, type Reader } from "./make-line-types.js";

/**
 * The rule lines of a Makefile: targets, a `:` or `::`, then the prerequisites and an inline
 * recipe after `;`, or an assignment for the targets (`gen: GEN = x`).
 */

const COLON: ReadonlySet<string> = new Set([":"]);
const SEMICOLON: ReadonlySet<string> = new Set([";"]);
const GROUPED_TARGETS = "&";
const DOUBLE_COLON_SECOND = ":";
/** `|` puts order-only prerequisites after the normal ones; both are built first. */
const ORDER_ONLY = "|";

/**
 * Read a rule line, or one that sets a variable for its targets. The targets end at the first
 * `:` outside references; an inline recipe starts at a `;` before any comment.
 */
export function readRule(reader: Reader, line: Line, first: number): void {
  const { text, found } = reader;
  const colon = findOutsideReferences(text, { start: first, end: line.content.end }, COLON);
  if (colon === -1) {
    hideComment(found, line);
    return;
  }
  const targetsEnd = text[colon - 1] === GROUPED_TARGETS ? colon - 1 : colon;
  const targets = makeWords(text, { start: first, end: targetsEnd }).map((word) => word.text);
  const restStart = text[colon + 1] === DOUBLE_COLON_SECOND ? colon + 2 : colon + 1;
  const rest = { start: restStart, end: line.content.end };
  const head = assignmentHead(text, rest);
  if (head?.kind === "definition") {
    readTargetAssignment(reader, head, { start: first, end: rest.end }, targets);
    hideComment(found, line);
    return;
  }
  const semicolon = findOutsideReferences(text, rest, SEMICOLON);
  const recipes = semicolon === -1 ? [] : [{ start: semicolon + 1, end: line.end }];
  if (semicolon === -1) {
    hideComment(found, line);
  }
  const prerequisites = prerequisitesOf(text, {
    start: restStart,
    end: semicolon === -1 ? rest.end : semicolon,
  });
  reader.recipes = recipes;
  found.rules.push({ start: first, end: line.end, targets, prerequisites, recipes });
}

/** Read an assignment for some targets (`gen: GEN = x`), whose value ends at `range.end`. */
function readTargetAssignment(
  reader: Reader,
  head: Extract<MakeAssignmentHead, { kind: "definition" }>,
  range: TextRange,
  targets: readonly string[],
): void {
  const { nameStart, nameEnd, operator, valueStart } = head.definition;
  const name = reader.text.slice(nameStart, nameEnd);
  const fields = { name, operator, start: range.start, valueStart, valueEnd: range.end, targets };
  reader.found.assignments.push(assignmentOf(reader, head, fields));
}

/** The prerequisites of a rule; a static pattern rule (`a.o: %.o: %.c`) names them last. */
function prerequisitesOf(text: string, range: TextRange): string[] {
  const pattern = findOutsideReferences(text, range, COLON);
  const start = pattern === -1 ? range.start : pattern + 1;
  return makeWords(text, { start, end: range.end })
    .map((word) => word.text)
    .filter((word) => word !== ORDER_ONLY);
}
