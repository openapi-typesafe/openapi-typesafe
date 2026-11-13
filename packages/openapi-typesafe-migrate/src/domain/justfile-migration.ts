import { type CommandMigration, commandWordFindings } from "./command-migration.js";
import type { FileVariables } from "./file-variables.js";
import {
  commandLiterals,
  concatenationOperands,
  concatenationsOf,
  concatenationText,
  firstOperandDefinition,
  isFirstPartProgram,
  type JustOperand,
  stringRunsGenerator,
} from "./just-concatenations.js";
import {
  expressionAt,
  interpolationsOf,
  type JustInterpolation,
  type JustLiteral,
} from "./just-expressions.js";
import {
  type ParameterDefault,
  type RecipeHeader,
  recipeHeaders,
} from "./just-recipe-parameters.js";
import { type ShebangRecipe, shebangRecipes } from "./just-shebang-recipes.js";
import { lineLocator, type ManualStep } from "./migration-findings.js";
import { namesOriginalPackage } from "./package-names.js";
import {
  type ShellCommand,
  type ShellWord,
  shellCommands,
  shellCommandsAt,
} from "./shell-words.js";
import { applyTextEdits } from "./text-edits.js";
import {
  type ProgramDefinition,
  type VariableProgram,
  variablePrograms,
} from "./variable-programs.js";

/**
 * Justfiles. just puts the value of a variable into a recipe line before the shell runs it, so a
 * variable can hold the generator command: `gen := "npx openapi-typescript"`, then
 * `{{gen}} a.yaml -it`. Each string literal and backtick of a just expression (a value, a
 * parameter default, an interpolation) is migrated where it is written, as a command line; the
 * flags after a variable set to the generator, or to such a variable (`run := gen`), where it is
 * used. A value that just computes (`env_var_or_default("GEN", "npx openapi-typescript")`, an
 * `if`) and a recipe parameter may run another program, so the flags after them are reported.
 * A recipe with a shebang for another program (`#!/usr/bin/env python3`) is code of that
 * language: it is reported when it names an old package. Everything else is shell text.
 */

/** An assignment at the start of a line: `gen := …`, also `export gen := …`. */
const ASSIGNMENT_RE = /^(export[ \t]+)?([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:=[ \t]*/gm;
/** `set export` (also `:= true`): every variable and parameter reaches the recipes' shell. */
const SET_EXPORT_RE = /^set[ \t]+export(?:[ \t]*:=[ \t]*true)?[ \t]*(?:#.*)?$/m;
/**
 * A word that expands one shell variable, after the recipe prefix: an exported variable reaches
 * the shell of a recipe as an environment variable (`$FLAGS`, `${FLAGS}`).
 */
const SHELL_VARIABLE_RE = /^[@+-]*"?\$(?:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\})"?$/;
/** A value that is the name of another variable. */
const NAME_VALUE_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
/** An interpolation of one variable, after the recipe prefix (`@`, `-`) of the line. */
const VARIABLE_INTERPOLATION_RE = /^[@+-]*\{\{[ \t]*([A-Za-z_][A-Za-z0-9_-]*)[ \t]*\}\}$/;
const MASK = "_";
const BLANK = " ";

/** An assignment of a justfile: the variable, its value as written, and their places. */
interface Assignment {
  readonly name: string;
  readonly isExported: boolean;
  /** The value as written, without a comment after it. */
  readonly value: string;
  readonly start: number;
  readonly end: number;
  readonly literals: readonly JustLiteral[];
  /** The parts of a value that joins strings and names with `+`, else undefined. */
  readonly operands: readonly JustOperand[] | undefined;
}

function assignmentsOf(text: string): Assignment[] {
  return [...text.matchAll(ASSIGNMENT_RE)].map((match) => {
    const valueStart = match.index + match[0].length;
    const { literals, end } = expressionAt(text, valueStart);
    const value = text.slice(valueStart, end).trim();
    const name = match[2] as string;
    const operands = concatenationOperands(text, { start: valueStart, end, literals });
    const isExported = match[1] !== undefined;
    return { name, isExported, value, start: match.index, end, literals, operands };
  });
}

/** The literal that is the whole value, or undefined for another expression. */
function onlyString({ value, literals }: Assignment): JustLiteral | undefined {
  const [literal] = literals;
  if (literals.length !== 1 || literal?.kind !== "string") {
    return undefined;
  }
  return value.length === literal.end - literal.start ? literal : undefined;
}

/**
 * The definitions of a value that just computes from `literals`, or that the command line gives:
 * it may be a string that runs the generator, and it may be anything else.
 */
function computedDefinitions(name: string, literals: readonly JustLiteral[]): ProgramDefinition[] {
  const other: ProgramDefinition = { name, kind: "command", runsGenerator: false };
  const isMaybeGenerator = literals.some(stringRunsGenerator);
  return isMaybeGenerator ? [{ name, kind: "command", runsGenerator: true }, other] : [other];
}

/** Each assignment as the programs it can set: a reference, a command, or a computed value. */
function assignmentDefinitions(assignment: Assignment): ProgramDefinition[] {
  const { name, value, operands } = assignment;
  if (NAME_VALUE_RE.test(value)) {
    return [{ name, kind: "reference", target: value }];
  }
  if (operands?.[0] !== undefined && isFirstPartProgram(operands)) {
    return [firstOperandDefinition(name, operands[0])];
  }
  const literal = onlyString(assignment);
  return literal === undefined
    ? computedDefinitions(name, assignment.literals)
    : [{ name, kind: "command", runsGenerator: stringRunsGenerator(literal) }];
}

/** A parameter: its default, and the command line, which can set anything. */
function parameterDefinitions({ name, literals, target }: ParameterDefault): ProgramDefinition[] {
  const fromCommandLine = computedDefinitions(name, literals);
  return target === undefined
    ? fromCommandLine
    : [{ name, kind: "reference", target }, ...fromCommandLine];
}

/** The shell text of a justfile, and the interpolations of its recipe lines. */
interface ShellText {
  readonly text: string;
  readonly interpolations: readonly JustInterpolation[];
}

/**
 * The text as the shell gets it: each interpolation one word of the same length, and each
 * assignment and recipe header blanked, since just reads them and no shell does. Blanks keep
 * every offset, so the interpolations found in it are those of the file's recipe lines.
 */
function shellText(text: string, spans: readonly { start: number; end: number }[]): ShellText {
  const parts: string[] = [];
  let copiedUpTo = 0;
  for (const { start, end } of [...spans].sort((left, right) => left.start - right.start)) {
    parts.push(text.slice(copiedUpTo, start), BLANK.repeat(end - start));
    copiedUpTo = end;
  }
  parts.push(text.slice(copiedUpTo));
  const blanked = parts.join("");
  const interpolations = interpolationsOf(blanked);
  const masked = interpolations.reduce(
    (current, { start, end }) =>
      current.slice(0, start) + MASK.repeat(end - start) + current.slice(end),
    blanked,
  );
  return { text: masked, interpolations };
}

/** The commands of literals, read as written: an escape (`\"`) stays two characters. */
const literalCommands = (literals: readonly JustLiteral[]): ShellCommand[] =>
  literals.flatMap((literal) => shellCommandsAt(literal.content, literal.contentStart));

/** The text an assignment gives its variable: a string's contents, or the value as written. */
function assignmentText(assignment: Assignment): string {
  const { operands } = assignment;
  return operands === undefined
    ? (onlyString(assignment)?.content ?? assignment.value)
    : concatenationText(operands);
}

/** The text a parameter default may give its variable: the contents of its literals. */
const defaultValue = ({ literals }: ParameterDefault): string =>
  literals.map((literal) => literal.content).join(BLANK);

/**
 * The values of the variables, for an argument that expands one (`{{flags}}`): each assignment,
 * and each parameter default (`*flags='-it'`), joined when a name has several.
 */
function variableValues(
  assignments: readonly Assignment[],
  defaults: readonly ParameterDefault[],
): Map<string, string> {
  const values = new Map<string, string>();
  const named = [
    ...assignments.map((found) => ({ ...found, value: assignmentText(found) })),
    ...defaults.map((found) => ({ name: found.name, value: defaultValue(found) })),
  ];
  for (const { name, value } of named) {
    values.set(name, [values.get(name), value].join(BLANK).trim());
  }
  return values;
}

/**
 * The program of a word with interpolations that are not one variable: one whose strings may run
 * the generator (`{{ env_var_or_default("GEN", "npx openapi-typescript") }}`) may also run another.
 */
function computedProgram(written: string): VariableProgram | undefined {
  const literals = interpolationsOf(written).flatMap((interpolation) => interpolation.literals);
  return literals.some(stringRunsGenerator) ? "generator-or-other" : undefined;
}

/** The names that reach the shell of a recipe: all with `set export`, else the exported ones. */
function exportedNames(
  text: string,
  assignments: readonly Assignment[],
  defaults: readonly ParameterDefault[],
): ReadonlySet<string> {
  const isAll = SET_EXPORT_RE.test(text);
  const names = [...assignments, ...defaults].filter((found) => isAll || found.isExported);
  return new Set(names.map((found) => found.name));
}

/** The variable that a word expands: an interpolation, or an exported shell variable. */
function expandedName(written: string, exported: ReadonlySet<string>): string | undefined {
  const interpolated = VARIABLE_INTERPOLATION_RE.exec(written)?.[1];
  const match = SHELL_VARIABLE_RE.exec(written);
  const shellName = match === null ? undefined : (match[1] ?? match[2]);
  return (
    interpolated ?? (shellName !== undefined && exported.has(shellName) ? shellName : undefined)
  );
}

/** What a justfile knows about its variables: their values, programs and exported names. */
interface JustVariables {
  readonly values: ReadonlyMap<string, string>;
  readonly programs: ReadonlyMap<string, VariableProgram>;
  readonly exported: ReadonlySet<string>;
}

/** The variables of a justfile, read from its assignments and recipe parameters. */
function justfileVariables(
  text: string,
  { values, programs, exported }: JustVariables,
): FileVariables {
  const writtenAt = (word: ShellWord): string => text.slice(word.start, word.end);
  const nameAt = (word: ShellWord) => expandedName(writtenAt(word), exported);
  return {
    programAt: (word) => {
      const name = nameAt(word);
      const written = writtenAt(word);
      const found = name === undefined ? computedProgram(written) : programs.get(name);
      return found === undefined ? undefined : { written, program: found };
    },
    referenceAt: (word) => {
      const name = nameAt(word);
      const value = name === undefined ? undefined : values.get(name);
      return value === undefined ? undefined : { written: writtenAt(word), value };
    },
  };
}

/** Each recipe that another program runs and that names an old package: code the tool skips. */
const shebangSteps = (
  text: string,
  recipes: readonly ShebangRecipe[],
  locate: (offset: number) => string,
): ManualStep[] =>
  recipes
    .filter((recipe) => namesOriginalPackage(text.slice(recipe.start, recipe.end)))
    .map(({ shebang, shell }) => ({ kind: "script-not-shell", location: locate(shebang), shell }));

/** Migrate a justfile; each finding names its `file:line`. */
export function migrateJustfile(text: string, file: string): CommandMigration {
  const lineOf = lineLocator(text);
  const assignments = assignmentsOf(text);
  const headers: RecipeHeader[] = recipeHeaders(text);
  const defaults = headers.flatMap((header) => header.defaults);
  const programs = variablePrograms([
    ...assignments.flatMap(assignmentDefinitions),
    ...defaults.flatMap(parameterDefinitions),
  ]);
  const variables = justfileVariables(text, {
    values: variableValues(assignments, defaults),
    programs,
    exported: exportedNames(text, assignments, defaults),
  });
  const scripts = shebangRecipes(text, headers);
  const shell = shellText(text, [...assignments, ...headers, ...scripts]);
  const concatenations = concatenationsOf(assignments, programs);
  const commands = [
    ...shellCommands(shell.text),
    ...literalCommands(commandLiterals(assignments)),
    ...concatenations.commands,
    ...literalCommands(defaults.flatMap((found) => found.literals)),
    ...literalCommands(shell.interpolations.flatMap((found) => found.literals)),
  ];
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const found = commandWordFindings(commands, locate, variables, concatenations.appended);
  const { edits, changes, manualSteps } = found;
  const steps = [...manualSteps, ...shebangSteps(text, scripts, locate)];
  return { text: applyTextEdits(text, edits), changes, manualSteps: steps };
}
