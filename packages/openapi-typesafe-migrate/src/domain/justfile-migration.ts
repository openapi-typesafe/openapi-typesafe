import { type CommandMigration, commandWordFindings } from "./command-migration.js";
import { type FileVariables, runsGenerator } from "./file-variables.js";
import { lineLocator } from "./migration-findings.js";
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
 * `{{gen}} a.yaml -it`. The value is migrated where it is set, as a quoted command line; the flags
 * after a variable set to the generator, or to such a variable (`run := gen`), where it is used.
 * Everything else is shell text.
 */

/** An assignment at the start of a line: `gen := …`, also `export gen := …`. */
const ASSIGNMENT_RE = /^(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:=[ \t]*(.*)$/gm;
/**
 * A value that is one string literal, before a comment if any; just reads no escapes in a
 * single-quoted one.
 */
const STRING_VALUE_RE = /^(?:"((?:[^"\\\n]|\\.)*)"|'([^'\n]*)')(?:[ \t]+#.*)?$/;
/** A value that is the name of another variable, before a comment if any. */
const NAME_VALUE_RE = /^([A-Za-z_][A-Za-z0-9_-]*)(?:[ \t]+#.*)?$/;
/** An interpolation in a recipe line: `{{gen}}`, `{{ gen }}`, or another expression. */
const INTERPOLATION_RE = /\{\{[^\n]*?\}\}/g;
/** An interpolation of one variable, after the recipe prefix (`@`, `-`) of the line. */
const VARIABLE_INTERPOLATION_RE = /^[@+-]*\{\{[ \t]*([A-Za-z_][A-Za-z0-9_-]*)[ \t]*\}\}$/;
const MASK = "_";
const BLANK = " ";

/** An assignment of a justfile: the variable, the expression of its value, and their places. */
interface Assignment {
  readonly name: string;
  readonly value: string;
  readonly start: number;
  readonly valueStart: number;
}

const assignmentsOf = (text: string): Assignment[] =>
  [...text.matchAll(ASSIGNMENT_RE)].map((match) => {
    const written = match[2] as string;
    const valueStart = match.index + match[0].length - written.length;
    return { name: match[1] as string, value: written.trim(), start: match.index, valueStart };
  });

/** The text of a string value, or undefined for another expression (a call, a backtick). */
function stringValue(value: string): string | undefined {
  const match = STRING_VALUE_RE.exec(value);
  return match === null ? undefined : (match[1] ?? match[2]);
}

/**
 * Each assignment as the program it sets: a reference to one variable, or a command that runs the
 * generator when its string does. Another expression (`env("GEN")`, a backtick) gets its value
 * only when just runs, so it is not the generator for the tool.
 */
function programDefinition({ name, value }: Assignment): ProgramDefinition {
  const target = NAME_VALUE_RE.exec(value)?.[1];
  if (target !== undefined) {
    return { name, kind: "reference", target };
  }
  const text = stringValue(value);
  const runs = text !== undefined && shellCommands(text).some(runsGenerator);
  return { name, kind: "command", runsGenerator: runs };
}

/**
 * The text as the shell gets it: each interpolation one word of the same length, and each
 * assignment blanked, since just reads it and no shell does.
 */
function shellText(text: string, assignments: readonly Assignment[]): string {
  const parts: string[] = [];
  let copiedUpTo = 0;
  for (const { start, valueStart, value } of assignments) {
    const end = valueStart + value.length;
    parts.push(text.slice(copiedUpTo, start), BLANK.repeat(end - start));
    copiedUpTo = end;
  }
  parts.push(text.slice(copiedUpTo));
  return parts.join("").replace(INTERPOLATION_RE, (found) => MASK.repeat(found.length));
}

/**
 * The commands in the string value of an assignment, read as written where it is set, as a quoted
 * command line of a shell text is: an escape (`\"`) stays two characters, so offsets map onto
 * the file.
 */
function valueCommands({ value, valueStart }: Assignment): ShellCommand[] {
  const inner = stringValue(value);
  return inner === undefined ? [] : shellCommandsAt(inner, valueStart + 1);
}

/** The variables of a justfile, read from its assignments. */
function justfileVariables(
  text: string,
  assignments: readonly Assignment[],
  programs: ReadonlyMap<string, VariableProgram>,
): FileVariables {
  const values = new Map<string, string>();
  for (const { name, value } of assignments) {
    values.set(name, [values.get(name), stringValue(value) ?? value].join(" ").trim());
  }
  const writtenAt = (word: ShellWord): string => text.slice(word.start, word.end);
  const nameAt = (word: ShellWord) => VARIABLE_INTERPOLATION_RE.exec(writtenAt(word))?.[1];
  return {
    programAt: (program) => {
      const name = nameAt(program);
      const found = name === undefined ? undefined : programs.get(name);
      return found === undefined ? undefined : { written: writtenAt(program), program: found };
    },
    referenceAt: (word) => {
      const name = nameAt(word);
      const value = name === undefined ? undefined : values.get(name);
      return value === undefined ? undefined : { written: writtenAt(word), value };
    },
  };
}

/** Migrate a justfile; each finding names its `file:line`. */
export function migrateJustfile(text: string, file: string): CommandMigration {
  const lineOf = lineLocator(text);
  const assignments = assignmentsOf(text);
  const programs = variablePrograms(assignments.map(programDefinition));
  const variables = justfileVariables(text, assignments, programs);
  const commands = [
    ...shellCommands(shellText(text, assignments)),
    ...assignments.flatMap(valueCommands),
  ];
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const { edits, changes, manualSteps } = commandWordFindings(commands, locate, variables);
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
