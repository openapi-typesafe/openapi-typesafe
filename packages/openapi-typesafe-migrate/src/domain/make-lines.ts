import { readAssignment } from "./make-assignment-lines.js";
import { assignmentHead, firstToken } from "./make-definitions.js";
import {
  commentStart,
  logicalLineEnd,
  type MakeWord,
  makeWords,
  skipBlanks,
} from "./make-line-text.js";
import {
  hideComment,
  type Line,
  type MakeConditional,
  type MakeLines,
  type MakeReadOptions,
  type Reader,
} from "./make-line-types.js";
import { readRule } from "./make-rule-lines.js";

export type {
  MakeAssignment,
  MakeConditional,
  MakeExportLine,
  MakeInclude,
  MakeLines,
  MakeReadOptions,
  MakeRule,
} from "./make-line-types.js";

/**
 * The lines of a Makefile as GNU make reads them (read.c `eval`), one logical line at a time (a
 * `\` at the end continues a line, a comment too). A line that starts with a tab after a rule is
 * a recipe line; any other line is make's: without its comment, it is a variable assignment (also
 * `define … endef`, whose body is the value, and one for some targets, `gen: GEN = x`), a
 * conditional directive, `export`, `include`, or a rule. A tab-started line before the first
 * rule, or after a line that ends the rule (any make line but a comment, a blank line and a
 * conditional), is a make line too.
 */

const RECIPE_PREFIX = "\t";
const ELSE = "else";
const UNEXPORT = "unexport";
const IF_DIRECTIVES: ReadonlySet<string> = new Set(["ifeq", "ifneq", "ifdef", "ifndef"]);
const CONDITIONALS: ReadonlySet<string> = new Set([...IF_DIRECTIVES, ELSE, "endif"]);
const EXPORTS: ReadonlySet<string> = new Set(["export", UNEXPORT]);
const INCLUDES: ReadonlySet<string> = new Set(["include", "-include", "sinclude"]);

/** The lines of a Makefile, in the order make reads them. */
export const readMakeLines = (text: string, options: MakeReadOptions = {}): MakeLines =>
  readMakeLinesInRule(text, options).lines;

/** Lines read from a place in a text, and whether a rule is open where the reading ends. */
export interface MakeLinesInRule {
  readonly lines: MakeLines;
  readonly endsInRule: boolean;
}

/**
 * The lines of a part of a Makefile that may start in a rule (`startsInRule`), for a reader that
 * reads a text in parts: a tab-started line there is a recipe line of a rule read before. The
 * recipe lines of that rule are not in the lines read.
 */
export function readMakeLinesInRule(
  text: string,
  options: MakeReadOptions & { readonly startsInRule?: boolean } = {},
): MakeLinesInRule {
  const found = {
    assignments: [],
    conditionals: [],
    rules: [],
    exports: [],
    includes: [],
    hidden: [],
  };
  const to = options.to ?? text.length;
  const reader: Reader = {
    text,
    to,
    isEvaluated: options.isEvaluated ?? false,
    found,
    recipes: options.startsInRule === true ? [] : undefined,
  };
  for (let start = options.from ?? 0; start < to; ) {
    if (options.fileStarts?.has(start) === true) {
      reader.recipes = undefined;
    }
    const end = logicalLineEnd(text, start, to);
    const content = { start, end: commentStart(text, start, end) };
    start = readLine(reader, { start, end, content }) + 1;
  }
  return { lines: found, endsInRule: reader.recipes !== undefined };
}

/** Read one logical line; the result is where the last line it reads ends. */
function readLine(reader: Reader, line: Line): number {
  const { text, found } = reader;
  if (text[line.start] === RECIPE_PREFIX && reader.recipes !== undefined) {
    reader.recipes.push(line);
    return line.end;
  }
  const first = skipBlanks(text, line.content.start, line.content.end);
  if (first === line.content.end) {
    hideComment(found, line);
    return line.end;
  }
  const head = assignmentHead(text, line.content);
  if (head !== undefined) {
    reader.recipes = undefined;
    hideComment(found, line);
    return readAssignment(reader, head, line, first);
  }
  return readDirective(reader, line, first);
}

/** Read a conditional, `export`, `include` or rule line; all but a conditional end a rule. */
function readDirective(reader: Reader, line: Line, first: number): number {
  const { text, found } = reader;
  const word = firstToken(text, line.content);
  const rest = makeWords(text, { start: first + word.length, end: line.content.end });
  if (CONDITIONALS.has(word)) {
    found.conditionals.push({ start: first, kind: conditionalKind(word, rest) });
    found.hidden.push(line);
    return line.end;
  }
  reader.recipes = undefined;
  if (EXPORTS.has(word)) {
    found.exports.push({
      start: first,
      isExport: word !== UNEXPORT,
      names: rest.map(({ text: name }) => name),
    });
    found.hidden.push(line);
  } else if (INCLUDES.has(word)) {
    found.includes.push({ start: line.start, end: line.end, paths: rest });
    found.hidden.push(line);
  } else {
    readRule(reader, line, first);
  }
  return line.end;
}

function conditionalKind(word: string, rest: readonly MakeWord[]): MakeConditional["kind"] {
  if (IF_DIRECTIVES.has(word)) {
    return "if";
  }
  if (word === ELSE) {
    return rest.length > 0 ? "else-if" : "else";
  }
  return "endif";
}
