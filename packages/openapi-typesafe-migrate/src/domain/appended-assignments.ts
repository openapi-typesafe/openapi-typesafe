import type { AppendedValue } from "./argument-findings.js";
import type { FileVariables, VariableProgramUse } from "./file-variables.js";
import {
  assignmentValueText,
  type ShellAssignment,
  shellAssignments,
} from "./shell-assignments.js";
import { type ShellCommand, shellCommands, shellCommandsAt } from "./shell-words.js";
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
 * The appended text of an assignment. A value built of several parts (`G+=" -it"$X`) has no
 * offsets in the text, so its words are placed at the assignment and the generator it may run is
 * not certain: its old flags are reported, never changed at a wrong place.
 */
function shellAppend(assignment: ShellAssignment, variables: FileVariables): ShellAppend {
  const at = assignment.word.start;
  const written = `$${assignment.name}`;
  const found = variables.programAt({ raw: written, value: written, start: at, end: at });
  const program: VariableProgramUse = found ?? { written, program: "generator-or-other" };
  const text = assignmentValueText(assignment);
  if (text !== undefined) {
    const [command] = shellCommandsAt(text.text, text.start);
    return { value: { words: command ?? [], program }, command };
  }
  const words = shellCommands(assignment.value)
    .flat()
    .map((word) => ({ ...word, start: at, end: at }));
  const isCertain = program.program === "other";
  const uncertain: VariableProgramUse = { ...program, program: "generator-or-other" };
  return { value: { words, program: isCertain ? program : uncertain }, command: undefined };
}

/** The commands without those that appended text reads, and the appended values. */
export interface ShellAppends {
  readonly commands: readonly ShellCommand[];
  readonly appended: readonly AppendedValue[];
}

/** The appended values of a shell text, read as the arguments after their variables. */
export function shellAppends(
  commands: readonly ShellCommand[],
  variables: FileVariables,
): ShellAppends {
  const appends = placedAssignments(commands)
    .filter(isAfterValue)
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
