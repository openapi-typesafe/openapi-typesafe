import {
  type AppendedValue,
  type CommandMigration,
  commandWordFindings,
} from "./command-migration.js";
import { commandRoles } from "./command-roles.js";
import { type FileVariables, runsGenerator } from "./file-variables.js";
import { functionCommands, maskExpansions } from "./make-expansions.js";
import { lineLocator } from "./migration-findings.js";
import { type ShellCommand, type ShellWord, shellCommands } from "./shell-words.js";
import { applyTextEdits } from "./text-edits.js";
import {
  type AppendedPlace,
  appendedPlace,
  type ProgramDefinition,
  type VariableProgram,
  variablePrograms,
} from "./variable-programs.js";

/**
 * Makefiles. Make expands its variables before a recipe line reaches the shell, so a variable can
 * hold the generator command: `OAT := openapi-typescript`, then `$(OAT) a.yaml -it`. The value of
 * an assignment is read as a command and migrated where it is set; the flags after a reference
 * to such a variable, or to one set to it (`GEN := $(OAT)`), are migrated where it is used. The
 * arguments of `$(or …)`, `$(and …)` and `$(if …)` are command lines where they are written
 * (make-expansions.ts). Everything else is shell text.
 */

/**
 * A variable assignment at the start of a line (not a recipe line, which starts with a tab), also
 * one for some targets only (`gen: OAT := openapi-typescript`).
 */
const ASSIGNMENT_RE = new RegExp(
  [
    "^(?:[^\\s:#=][^:#=\\n]*:[ \\t]*)?",
    "(?:(?:export|override|private)[ \\t]+)*",
    "([A-Za-z_][A-Za-z0-9_.-]*)",
    "[ \\t]*(:::=|::=|:=|\\?=|\\+=|!=|=)",
  ].join(""),
  "gm",
);
/**
 * A reference to one variable, as a whole word: `$(NAME)`, `${NAME}`, or `$N` for a variable whose
 * name is one letter, as make reads a `$` before any other character.
 */
const VARIABLE_REFERENCE_RE =
  /^\$(?:\(([A-Za-z_][A-Za-z0-9_.-]*)\)|\{([A-Za-z_][A-Za-z0-9_.-]*)\}|([A-Za-z_]))$/;
/** `@`, `-` and `+` before a recipe line: silent, ignore errors, always run. */
const RECIPE_PREFIX_RE = /^[@+-]+/;
const NOT_LINE_BREAK_RE = /[^\n]/g;
const LINE_BREAK = "\n";
const BACKSLASH = "\\";

/** `+=` adds text to the value a variable already has, so the program it runs stays. */
const APPEND_OPERATOR = "+=";
/** `?=` sets a variable only when the environment or the command line does not. */
const CONDITIONAL_OPERATOR = "?=";

/** An assignment of a Makefile: the variable, its operator, where it starts and its value is. */
interface Assignment {
  readonly name: string;
  readonly operator: string;
  readonly start: number;
  readonly valueStart: number;
  readonly valueEnd: number;
}

/** Where the line that holds `index` ends; a `\` before a line break continues it. */
function logicalLineEnd(text: string, index: number): number {
  let end = text.indexOf(LINE_BREAK, index);
  while (end !== -1 && text[end - 1] === BACKSLASH) {
    end = text.indexOf(LINE_BREAK, end + 1);
  }
  return end === -1 ? text.length : end;
}

const assignmentsOf = (text: string): Assignment[] =>
  [...text.matchAll(ASSIGNMENT_RE)].map((match) => {
    const valueStart = match.index + match[0].length;
    const valueEnd = logicalLineEnd(text, valueStart);
    const name = match[1] as string;
    const operator = match[2] as string;
    return { name, operator, start: match.index, valueStart, valueEnd };
  });

/** The text with the `NAME :=` of each assignment blanked, so its value reads as a command. */
function withoutAssignmentHeads(text: string, assignments: readonly Assignment[]): string {
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

/** A make expansion at the start of a word: a reference or a function call such as `$(or …)`. */
const COMPUTED_RE = /^\$[({]/;

/**
 * Whether a word starts with a make expansion that is not a plain reference (`$(or $(GEN),npx
 * openapi-typescript)`, `$(shell …)`): make computes the program, which may be the generator.
 */
const isComputed = (written: string): boolean =>
  COMPUTED_RE.test(written.trim().replace(RECIPE_PREFIX_RE, ""));

/** The variable that `written` references as a whole, after the recipe prefix, or undefined. */
function referencedName(written: string): string | undefined {
  const match = VARIABLE_REFERENCE_RE.exec(written.trim().replace(RECIPE_PREFIX_RE, ""));
  return match === null ? undefined : (match[1] ?? match[2] ?? match[3]);
}

/** The program word of a command as written, or "" for a command without one. */
function programWritten(text: string, command: ShellCommand): string {
  const { program } = commandRoles(command);
  const word = program === undefined ? undefined : command[program];
  return word === undefined ? "" : text.slice(word.start, word.end);
}

/**
 * The program an assignment's value sets, by the program word of its first command: a reference
 * to one variable (`GEN := $(OAT) --redoc r.yaml`), a program make computes (`$(or $(GEN),npx
 * openapi-typescript)`), which the run decides, or a command, which runs the generator when one
 * of the commands that start in the value does.
 */
function valueDefinition(
  text: string,
  { name, valueStart, valueEnd }: Assignment,
  commands: readonly ShellCommand[],
): ProgramDefinition {
  const inValue = commands.filter(
    ([first]) => first !== undefined && valueStart <= first.start && first.start < valueEnd,
  );
  // The command that starts first holds the program; the others are in its arguments.
  const [first] = inValue.sort((left, right) => (left[0]?.start ?? 0) - (right[0]?.start ?? 0));
  if (first === undefined) {
    return { name, kind: "no-program" };
  }
  const program = programWritten(text, first);
  const target = referencedName(program);
  if (target !== undefined) {
    return { name, kind: "reference", target };
  }
  if (isComputed(program)) {
    return { name, kind: "run-time" };
  }
  return { name, kind: "command", runsGenerator: inValue.some(runsGenerator) };
}

/** An assignment, and for a `+=` one, where its text is in the variable's value. */
interface PlacedAssignment {
  readonly assignment: Assignment;
  readonly place: AppendedPlace | undefined;
}

/** The assignments with their places, from the values that earlier lines set. */
function placedAssignments(text: string, assignments: readonly Assignment[]): PlacedAssignment[] {
  return assignments.map((assignment, index) => {
    if (assignment.operator !== APPEND_OPERATOR) {
      return { assignment, place: undefined };
    }
    const earlier = assignments
      .slice(0, index)
      .filter((found) => found.name === assignment.name)
      .map(({ valueStart, valueEnd }) => text.slice(valueStart, valueEnd));
    return { assignment, place: appendedPlace(earlier) };
  });
}

/**
 * Each assignment as the programs it can set. Text appended after a value keeps its program; one
 * appended after a value from outside the file, or a `?=` value, is also whatever the environment
 * or the command line sets; text appended to an empty value is the value.
 */
function programDefinitions(
  text: string,
  commands: readonly ShellCommand[],
  placed: readonly PlacedAssignment[],
): ProgramDefinition[] {
  return placed.flatMap(({ assignment, place }): ProgramDefinition[] => {
    const { name, operator } = assignment;
    if (place === "after-value") {
      return [{ name, kind: "no-program" }];
    }
    if (place === "after-outside") {
      return [{ name, kind: "run-time" }];
    }
    const value = valueDefinition(text, assignment, commands);
    return operator === CONDITIONAL_OPERATOR ? [value, { name, kind: "run-time" }] : [value];
  });
}

/** The commands of an appended text, and the others. */
interface AppendedCommands {
  readonly commands: readonly ShellCommand[];
  readonly appended: readonly AppendedValue[];
}

const startsIn = (command: ShellCommand, { valueStart, valueEnd }: Assignment): boolean => {
  const start = command[0]?.start ?? -1;
  return valueStart <= start && start < valueEnd;
};

/**
 * The text appended after a value (`GEN += --immutable-types`): its words are arguments of the
 * program the variable runs, not a command of their own, in the order they are written.
 */
function appendedCommands(
  commands: readonly ShellCommand[],
  placed: readonly PlacedAssignment[],
  programs: ReadonlyMap<string, VariableProgram>,
): AppendedCommands {
  const appends = placed.filter(({ place }) => place !== undefined && place !== "start");
  const appended = appends.map(({ assignment }): AppendedValue => {
    const words = commands
      .filter((command) => startsIn(command, assignment))
      .flat()
      .sort((left, right) => left.start - right.start);
    const written = `$(${assignment.name})`;
    const program = programs.get(assignment.name) ?? "generator-or-other";
    return { words, program: { written, program } };
  });
  const isAppended = (command: ShellCommand): boolean =>
    appends.some(({ assignment }) => startsIn(command, assignment));
  return { commands: commands.filter((command) => !isAppended(command)), appended };
}

/** The values each variable gets in the file, joined: any of them can reach a command. */
function variableValues(text: string, assignments: readonly Assignment[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const { name, valueStart, valueEnd } of assignments) {
    const value = text.slice(valueStart, valueEnd);
    values.set(name, [values.get(name), value].filter((part) => part !== undefined).join(" "));
  }
  return values;
}

/** The variables of a Makefile, read from its assignments. */
function makefileVariables(
  text: string,
  assignments: readonly Assignment[],
  programs: ReadonlyMap<string, VariableProgram>,
) {
  const values = variableValues(text, assignments);
  const nameAt = (word: ShellWord) => referencedName(text.slice(word.start, word.end));
  const variables: FileVariables = {
    programAt: (program) => {
      const written = text.slice(program.start, program.end);
      const name = nameAt(program);
      if (name === undefined) {
        return isComputed(written) ? { written, program: "generator-or-other" } : undefined;
      }
      // A variable that no line of the file sets comes from an included file, the command line
      // or the environment, so it may run the generator.
      return { written, program: programs.get(name) ?? "generator-or-other" };
    },
    referenceAt: (word) => {
      const name = nameAt(word);
      const value = name === undefined ? undefined : values.get(name);
      const written = text.slice(word.start, word.end);
      return value === undefined ? undefined : { written, value };
    },
  };
  return variables;
}

/** Migrate a Makefile; each finding names its `file:line`. */
export function migrateMakefile(text: string, file: string): CommandMigration {
  const lineOf = lineLocator(text);
  const assignments = assignmentsOf(text);
  const commands = [
    ...shellCommands(withoutAssignmentHeads(maskExpansions(text), assignments)),
    ...functionCommands(text),
  ];
  const placed = placedAssignments(text, assignments);
  const programs = variablePrograms(programDefinitions(text, commands, placed));
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const variables = makefileVariables(text, assignments, programs);
  const own = appendedCommands(commands, placed, programs);
  const found = commandWordFindings(own.commands, locate, variables, own.appended);
  const { edits, changes, manualSteps } = found;
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
