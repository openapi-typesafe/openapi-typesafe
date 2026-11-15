/**
 * The lines of a Makefile that make reads before it runs any recipe: variable assignments, also
 * for some targets only (`gen: OAT := openapi-typescript`), the conditional directives that make
 * some of them alternatives (`ifeq … else … endif`), and the `export` lines that give a variable
 * to the programs a recipe runs, a sub-make among them.
 */

/**
 * A variable assignment at the start of a line (not a recipe line, which starts with a tab), also
 * one for some targets only, with the modifiers before its name.
 */
const ASSIGNMENT_RE = new RegExp(
  [
    "^(?:([^\\s:#=][^:#=\\n]*):[ \\t]*)?",
    "((?:(?:export|override|private)[ \\t]+)*)",
    "([A-Za-z_][A-Za-z0-9_.-]*)",
    "[ \\t]*(:::=|::=|:=|\\?=|\\+=|!=|=)",
  ].join(""),
  "gm",
);
/** A conditional directive; make does not allow a tab before it, which starts a recipe line. */
const CONDITIONAL_RE = /^ *(ifeq|ifneq|ifdef|ifndef|else|endif)(?![A-Za-z0-9_.-])(.*)$/gm;
/** `export NAME …` or `unexport NAME …` without a value: a list of names, or all variables. */
const EXPORT_RE = /^ *(export|unexport)(?:[ \t]+([^=\n]*))?$/gm;
/** The special target that exports every variable. */
const EXPORT_ALL_RE = /^\.EXPORT_ALL_VARIABLES[ \t]*:/m;
const BLANKS_RE = /\s+/;
const NOT_LINE_BREAK_RE = /[^\n]/g;
const LINE_BREAK = "\n";
const BACKSLASH = "\\";
const OVERRIDE = "override";
const EXPORT = "export";
const PRIVATE = "private";
const UNEXPORT = "unexport";
const ELSE = "else";

/** An assignment of a Makefile: the variable, its operator and modifiers, where its value is. */
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
}

/** Where the line that holds `index` ends; a `\` before a line break continues it. */
function logicalLineEnd(text: string, index: number): number {
  let end = text.indexOf(LINE_BREAK, index);
  while (end !== -1 && text[end - 1] === BACKSLASH) {
    end = text.indexOf(LINE_BREAK, end + 1);
  }
  return end === -1 ? text.length : end;
}

const wordsOf = (text: string | undefined): string[] =>
  (text ?? "").split(BLANKS_RE).filter((word) => word !== "");

/** The assignments of a Makefile, in the order make reads them. */
export function makeAssignments(text: string): MakeAssignment[] {
  return [...text.matchAll(ASSIGNMENT_RE)].map((match) => {
    const valueStart = match.index + match[0].length;
    const modifiers = new Set(wordsOf(match[2]));
    const targets = match[1] === undefined ? undefined : wordsOf(match[1]);
    return {
      name: match[3] as string,
      operator: match[4] as string,
      start: match.index,
      valueStart,
      valueEnd: logicalLineEnd(text, valueStart),
      targets,
      isOverride: modifiers.has(OVERRIDE),
      isExport: modifiers.has(EXPORT),
      isPrivate: modifiers.has(PRIVATE),
    };
  });
}

/** The text with the `NAME :=` of each assignment blanked, so its value reads as a command. */
export function withoutAssignmentHeads(text: string, assignments: readonly MakeAssignment[]) {
  const parts: string[] = [];
  let copiedUpTo = 0;
  for (const { start, valueStart } of assignments) {
    parts.push(
      text.slice(copiedUpTo, start),
      text.slice(start, valueStart).replace(NOT_LINE_BREAK_RE, " "),
    );
    copiedUpTo = valueStart;
  }
  parts.push(text.slice(copiedUpTo));
  return parts.join("");
}

/** A conditional directive: where it is, and whether it opens, continues or closes a block. */
export interface MakeConditional {
  readonly start: number;
  readonly kind: "if" | "else" | "else-if" | "endif";
}

const IF_DIRECTIVES: ReadonlySet<string> = new Set(["ifeq", "ifneq", "ifdef", "ifndef"]);

/** The conditional directives of a Makefile; `else ifeq …` continues a block with a condition. */
export function makeConditionals(text: string): MakeConditional[] {
  return [...text.matchAll(CONDITIONAL_RE)].map((match) => {
    const directive = match[1] as string;
    const start = match.index;
    if (IF_DIRECTIVES.has(directive)) {
      return { start, kind: "if" };
    }
    if (directive === ELSE) {
      return { start, kind: wordsOf(match[2]).length > 0 ? "else-if" : "else" };
    }
    return { start, kind: "endif" };
  });
}

/**
 * Whether make gives the variable `name` to the programs its recipes run: an `export`
 * assignment or line names it, or a bare `export` or `.EXPORT_ALL_VARIABLES` exports all, and no
 * later `unexport` takes it back.
 */
export function isExported(
  text: string,
  assignments: readonly MakeAssignment[],
  name: string,
): boolean {
  const events = [...text.matchAll(EXPORT_RE)].flatMap((match) => {
    const names = wordsOf(match[2]);
    const isNamed = names.length === 0 || names.includes(name);
    return isNamed ? [{ start: match.index, isExport: match[1] !== UNEXPORT }] : [];
  });
  const own = assignments
    .filter((assignment) => assignment.name === name && assignment.isExport)
    .map(({ start }) => ({ start, isExport: true }));
  const last = [...events, ...own].sort((left, right) => left.start - right.start).at(-1);
  return last === undefined ? EXPORT_ALL_RE.test(text) : last.isExport;
}
