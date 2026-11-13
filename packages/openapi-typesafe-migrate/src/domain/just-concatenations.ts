import type { AppendedValue } from "./argument-findings.js";
import type { VariableProgramUse } from "./file-variables.js";
import { runsGenerator } from "./file-variables.js";
import type { JustLiteral } from "./just-expressions.js";
import { type ShellCommand, shellCommands, shellCommandsAt } from "./shell-words.js";
import type { ProgramDefinition, VariableProgram } from "./variable-programs.js";

/**
 * A justfile value that joins strings and variables with `+` (`gen := "npx openapi-typescript" +
 * " -it"`). just puts the joined value into a recipe line before the shell splits it, so the text
 * of each string after the first is appended to the command of the first: its words are arguments
 * of that program, not a command of their own. When every later part is a string joined at a
 * blank, the first part holds the program; a variable or a join inside a word can change the
 * program word, so the value is computed and the flags in its later strings are reported.
 */

/** A part of a `+` concatenation: a string literal or the name of a variable. */
export type JustOperand =
  | { readonly kind: "literal"; readonly literal: JustLiteral }
  | { readonly kind: "name"; readonly name: string };

const NAME_RE = /[A-Za-z_][A-Za-z0-9_-]*/y;
const BLANK_RE = /[ \t]*/y;
const BLANK_EDGE_RE = /^[ \t]|[ \t]$/;
const PLUS = "+";

/** The offset after the blanks at `index`. */
function afterBlanks(text: string, index: number): number {
  BLANK_RE.lastIndex = index;
  BLANK_RE.exec(text);
  return BLANK_RE.lastIndex;
}

/** The operand at `index` and the offset after it, or undefined for any other expression. */
function operandAt(
  text: string,
  index: number,
  literals: readonly JustLiteral[],
): { readonly operand: JustOperand; readonly end: number } | undefined {
  const literal = literals.find((found) => found.start === index);
  if (literal !== undefined) {
    return literal.kind === "string"
      ? { operand: { kind: "literal", literal }, end: literal.end }
      : undefined;
  }
  NAME_RE.lastIndex = index;
  const name = NAME_RE.exec(text)?.[0];
  return name === undefined
    ? undefined
    : { operand: { kind: "name", name }, end: index + name.length };
}

/** Where a value is in the text, and the literals the expression has. */
export interface JustValue {
  readonly start: number;
  readonly end: number;
  readonly literals: readonly JustLiteral[];
}

/**
 * The operands of a value that only joins strings and names with `+`, or undefined for one part
 * or any other expression (a function call, an `if`, a backtick), which just computes.
 */
export function concatenationOperands(text: string, value: JustValue): JustOperand[] | undefined {
  const operands: JustOperand[] = [];
  for (let index = afterBlanks(text, value.start); index < value.end; ) {
    const found = operandAt(text, index, value.literals);
    if (found === undefined) {
      return undefined;
    }
    operands.push(found.operand);
    index = afterBlanks(text, found.end);
    const isLast = index >= value.end;
    if (!isLast && text[index] !== PLUS) {
      return undefined;
    }
    index = isLast ? index : afterBlanks(text, index + 1);
  }
  return operands.length > 1 ? operands : undefined;
}

/** Whether a literal ends with a blank, so a part joined after it starts a new word. */
const isBlankEnd = (literal: JustLiteral): boolean => BLANK_EDGE_RE.test(literal.content.slice(-1));

/**
 * Whether the first part of a concatenation holds the program: every later part is a string
 * joined at a blank, so no word spans a join and the program word stays the first part's.
 */
export function isFirstPartProgram(operands: readonly JustOperand[]): boolean {
  return operands.slice(1).every((operand, index) => {
    const previous = operands[index];
    if (operand.kind !== "literal") {
      return false;
    }
    const isBlankStart = BLANK_EDGE_RE.test(operand.literal.content.slice(0, 1));
    return isBlankStart || (previous?.kind === "literal" && isBlankEnd(previous.literal));
  });
}

/** Whether a literal is a string whose text, read as a command line, runs the generator. */
export const stringRunsGenerator = (literal: JustLiteral): boolean =>
  literal.kind === "string" && shellCommands(literal.content).some(runsGenerator);

/** What the first part of a concatenation sets the variable to, when it holds the program. */
export function firstOperandDefinition(name: string, operand: JustOperand): ProgramDefinition {
  return operand.kind === "name"
    ? { name, kind: "reference", target: operand.name }
    : { name, kind: "command", runsGenerator: stringRunsGenerator(operand.literal) };
}

/** What the first part of a concatenation runs: a variable's program, or a string's. */
function partProgram(
  operand: JustOperand,
  programs: ReadonlyMap<string, VariableProgram>,
): VariableProgram {
  if (operand.kind === "name") {
    return programs.get(operand.name) ?? "generator-or-other";
  }
  return stringRunsGenerator(operand.literal) ? "generator" : "other";
}

/** The literals after the first part: text appended to the value. */
const appendedLiterals = (operands: readonly JustOperand[]): JustLiteral[] =>
  operands.slice(1).flatMap((operand) => (operand.kind === "literal" ? [operand.literal] : []));

/** The value read as text: the contents of its strings, joined as just joins them. */
export const concatenationText = (operands: readonly JustOperand[]): string =>
  operands.map((operand) => (operand.kind === "literal" ? operand.literal.content : "")).join("");

/** A value of a justfile variable, with the parts of a concatenation. */
export interface ConcatenatedValue {
  readonly name: string;
  readonly literals: readonly JustLiteral[];
  readonly operands: readonly JustOperand[] | undefined;
}

/** The literals of values that are command lines where written: not appended text. */
export function commandLiterals(values: readonly ConcatenatedValue[]): JustLiteral[] {
  const appended = new Set(values.flatMap(({ operands }) => appendedLiterals(operands ?? [])));
  return values.flatMap(({ literals }) => literals).filter((found) => !appended.has(found));
}

/** The text appended in one concatenation, after the program `use` names. */
function concatenationAppends(operands: readonly JustOperand[], use: VariableProgramUse) {
  const parts = appendedLiterals(operands).map((literal) =>
    shellCommandsAt(literal.content, literal.contentStart),
  );
  return {
    appended: parts.map(([words]): AppendedValue => ({ words: words ?? [], program: use })),
    // A later command (after a `;` in the string) is one of its own in the recipe line.
    commands: parts.flatMap((commands) => commands.slice(1)),
  };
}

/** The appended text of concatenations, and the commands after it. */
export interface Concatenations {
  readonly appended: readonly AppendedValue[];
  readonly commands: readonly ShellCommand[];
}

/**
 * The text appended in concatenations: after the program of the first part when it holds the
 * program, else after the program of the computed variable.
 */
export function concatenationsOf(
  values: readonly ConcatenatedValue[],
  programs: ReadonlyMap<string, VariableProgram>,
): Concatenations {
  const parts = values.flatMap(({ name, operands }) => {
    const [first] = operands ?? [];
    if (operands === undefined || first === undefined) {
      return [];
    }
    const isFirst = isFirstPartProgram(operands);
    const program = isFirst
      ? partProgram(first, programs)
      : (programs.get(name) ?? "generator-or-other");
    return [concatenationAppends(operands, { written: name, program })];
  });
  return {
    appended: parts.flatMap((part) => part.appended),
    commands: parts.flatMap((part) => part.commands),
  };
}
