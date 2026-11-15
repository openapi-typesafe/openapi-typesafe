import type { AppendedValue } from "./argument-findings.js";
import { type FileVariables, runsGenerator, type VariableProgramUse } from "./file-variables.js";
import { assignmentValue, type ShellAssignment, shellAssignments } from "./shell-assignments.js";
import { placedCommands, type ShellCommand } from "./shell-words.js";
import { type AppendedPlace, appendedPlace } from "./variable-programs.js";

/**
 * The `NAME+=value` assignments of a shell text (bash, ksh, zsh). A value appended after the value
 * a variable has (`G="npx openapi-typescript"`, then `G+=" -it"`) holds arguments of the program
 * that value runs, so `$G c.yaml` runs the generator with `-it`: the appended words are read as
 * the arguments after `$G`, not as a command of their own.
 */

/** An assignment, and for one that appends, where its text is in the variable's value. */
export interface PlacedAssignment {
  readonly assignment: ShellAssignment;
  readonly place: AppendedPlace | undefined;
}

/** The assignments of the commands in the order of the text, each with its place. */
export function placedAssignments(commands: readonly ShellCommand[]): PlacedAssignment[] {
  const all = commands.flatMap(shellAssignments).sort((left, right) => {
    return left.word.start - right.word.start;
  });
  return all.map((assignment, index) => {
    if (!assignment.isAppend) {
      return { assignment, place: undefined };
    }
    const earlier = all.slice(0, index).filter((found) => found.name === assignment.name);
    return { assignment, place: appendedPlace(earlier.map((found) => found.value)) };
  });
}

/** Whether appended text comes after a value, so its words are arguments of that value. */
export const isAfterValue = ({ place }: PlacedAssignment): boolean =>
  place === "after-value" || place === "after-outside";

/** One appended value, and the command that the text reads where it is written, if any. */
interface ShellAppend {
  readonly value: AppendedValue;
  readonly command: ShellCommand | undefined;
}

/**
 * The appended text of an assignment, its words placed where they are written, also in a value
 * of several parts (`G+=" -it "$X`), whose characters each have their place in the text.
 */
function shellAppend(assignment: ShellAssignment, variables: FileVariables): ShellAppend {
  const at = assignment.word.start;
  const written = `$${assignment.name}`;
  const found = variables.programAt({ raw: written, value: written, start: at, end: at });
  const program: VariableProgramUse = found ?? { written, program: "generator-or-other" };
  const [command] = appendedText(assignment);
  return { value: { words: command ?? [], program }, command };
}

/** The commands without those that appended text reads, and the appended values. */
export interface ShellAppends {
  readonly commands: readonly ShellCommand[];
  readonly appended: readonly AppendedValue[];
}

/**
 * Whether text appended after a value from outside the file is a command of its own: one that
 * runs the generator itself (`H+="npx openapi-typescript"`, make's `GEN += npx …`). What comes
 * before it is then empty or a prefix (a launcher, `time`) of that command, so the generator in
 * it is migrated where it is written. Any other text holds arguments of a program the tool does
 * not know, whose old flags are reported.
 */
export const isOwnGeneratorCommand = (
  place: AppendedPlace | undefined,
  command: ShellCommand | undefined,
): boolean => place === "after-outside" && command !== undefined && runsGenerator(command);

/** The commands that the appended text of an assignment holds, placed where they are written. */
function appendedText(assignment: ShellAssignment): ShellCommand[] {
  return placedCommands(assignmentValue(assignment));
}

/** Whether an assignment appends a command that runs the generator to a value from outside. */
export const appendsOwnGenerator = ({ assignment, place }: PlacedAssignment): boolean =>
  isOwnGeneratorCommand(place, appendedText(assignment)[0]);

/**
 * Whether an assignment says what its variable's program may be: one that sets a value, and any
 * `+=` after it or after an appended command that runs the generator itself
 * (`H+="npx openapi-typescript"`, then `H+=" -it"`), which may start the value. Text appended
 * only to a value from outside the text says nothing of the program, however many times: the
 * environment or the file's own variables give it.
 */
export function setsKnownProgram(
  placed: PlacedAssignment,
  all: readonly PlacedAssignment[],
): boolean {
  const chain = all
    .slice(0, all.indexOf(placed) + 1)
    .filter((earlier) => earlier.assignment.name === placed.assignment.name);
  return chain.some((part) => part.place !== "after-outside" || appendsOwnGenerator(part));
}

/** The appended values of a shell text, read as the arguments after their variables. */
export function shellAppends(
  commands: readonly ShellCommand[],
  variables: FileVariables,
): ShellAppends {
  const appends = placedAssignments(commands)
    .filter(isAfterValue)
    .filter((placed) => !appendsOwnGenerator(placed))
    .map(({ assignment }) => shellAppend(assignment, variables));
  const taken = new Set(appends.flatMap(({ command }) => (command === undefined ? [] : [command])));
  const isTaken = (command: ShellCommand): boolean =>
    [...taken].some(
      (found) => found.length === command.length && found[0]?.start === command[0]?.start,
    );
  return {
    commands: commands.filter((command) => !isTaken(command)),
    appended: appends.map(({ value }) => value),
  };
}
