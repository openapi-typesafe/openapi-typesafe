import { isBlank, referenceEnd, skipBlanks, type TextRange } from "./make-line-text.js";

/**
 * The variable definitions of Makefile lines, as GNU make finds them (read.c
 * `parse_var_assignment`): the modifiers (`export`, `override`, `private`, `define`, …), then a
 * name and an operator. The name ends at the operator or at blanks that an operator follows;
 * any other text after blanks, or a `:` that is no operator, makes the line no definition.
 */

/** The operators, longest first, so `::=` is not read as `:` then `:=`. */
const OPERATORS = [":::=", "::=", ":=", "+=", "?=", "!=", "="];
const DEFAULT_OPERATOR = "=";
const COLON = ":";
const DOLLAR = "$";
const MODIFIERS: ReadonlySet<string> = new Set(["export", "unexport", "override", "private"]);
const DEFINE = "define";
const UNDEFINE = "undefine";

/** A variable definition: where its name is, its operator, and where its value starts. */
export interface MakeDefinition {
  readonly nameStart: number;
  readonly nameEnd: number;
  readonly operator: string;
  readonly valueStart: number;
}

const operatorAt = (text: string, index: number, end: number): string | undefined =>
  OPERATORS.find((operator) => text.startsWith(operator, index) && index + operator.length <= end);

/** The variable definition that a part of a line is, or undefined. */
export function variableDefinition(text: string, range: TextRange): MakeDefinition | undefined {
  const nameStart = skipBlanks(text, range.start, range.end);
  let blankStart: number | undefined;
  for (let index = nameStart; index < range.end; ) {
    if (text[index] === DOLLAR) {
      index = referenceEnd(text, index, range.end);
      continue;
    }
    if (isBlank(text[index])) {
      blankStart = index;
      index = skipBlanks(text, index, range.end);
      continue;
    }
    const operator = operatorAt(text, index, range.end);
    if (operator !== undefined) {
      const nameEnd = blankStart ?? index;
      return { nameStart, nameEnd, operator, valueStart: index + operator.length };
    }
    if (text[index] === COLON || blankStart !== undefined) {
      return undefined;
    }
    index++;
  }
  return undefined;
}

/**
 * The head of an assignment: its modifiers, and the definition, or for `define` and `undefine`
 * where the rest of the line (the name, for `define` an operator after it) starts.
 */
export type MakeAssignmentHead =
  | {
      readonly kind: "definition";
      readonly modifiers: ReadonlySet<string>;
      readonly definition: MakeDefinition;
    }
  | {
      readonly kind: "define";
      readonly modifiers: ReadonlySet<string>;
      readonly restStart: number;
    }
  | {
      readonly kind: "undefine";
      readonly modifiers: ReadonlySet<string>;
      readonly restStart: number;
    };

/** Where the word that starts at `start` ends: at a blank or at `end`. */
function tokenEnd(text: string, start: number, end: number): number {
  let index = start;
  while (index < end && !isBlank(text[index])) {
    index++;
  }
  return index;
}

/** The first word of a part of a line, as make compares directive names. */
export function firstToken(text: string, range: TextRange): string {
  const start = skipBlanks(text, range.start, range.end);
  return text.slice(start, tokenEnd(text, start, range.end));
}

/**
 * The assignment head that a part of a line starts with, or undefined for another line. After
 * the targets of a rule (`gen: NAME = value`) only a definition sets a variable.
 */
export function assignmentHead(text: string, range: TextRange): MakeAssignmentHead | undefined {
  const modifiers = new Set<string>();
  for (let index = skipBlanks(text, range.start, range.end); index < range.end; ) {
    const definition = variableDefinition(text, { start: index, end: range.end });
    if (definition !== undefined) {
      return { kind: "definition", modifiers, definition };
    }
    const end = tokenEnd(text, index, range.end);
    const word = text.slice(index, end);
    const restStart = skipBlanks(text, end, range.end);
    if (word === DEFINE || word === UNDEFINE) {
      const kind = word === DEFINE ? ("define" as const) : ("undefine" as const);
      return { kind, modifiers, restStart };
    }
    if (!MODIFIERS.has(word)) {
      return undefined;
    }
    modifiers.add(word);
    index = restStart;
  }
  return undefined;
}

/** The name and operator of a `define` line (`define GEN :=`); the operator defaults to `=`. */
export function defineName(text: string, range: TextRange): { name: string; operator: string } {
  const written = text.slice(range.start, range.end).trim();
  const operator = OPERATORS.find((candidate) => written.endsWith(candidate));
  if (operator === undefined) {
    return { name: written, operator: DEFAULT_OPERATOR };
  }
  return { name: written.slice(0, -operator.length).trim(), operator };
}
