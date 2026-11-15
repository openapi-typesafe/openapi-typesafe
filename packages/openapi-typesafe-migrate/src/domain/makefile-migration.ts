import { type CommandMigration, commandWordFindings } from "./command-migration.js";
import {
  type MakeAssignment,
  makeAssignments,
  makeConditionals,
  withoutAssignmentHeads,
} from "./make-assignments.js";
import { type CalledMakefiles, makeCallAppends, NO_CALLED_MAKEFILES } from "./make-calls.js";
import { functionCommands, maskExpansions, unreadCallSteps } from "./make-expansions.js";
import type { MakeReading } from "./make-programs.js";
import { makeTargets } from "./make-rules.js";
import { makeValues, replacesCommandLine } from "./make-values.js";
import { assignmentReadings, exportedProgram, makefileVariables } from "./make-variables.js";
import { lineLocator } from "./migration-findings.js";
import { type ShellCommand, shellCommands } from "./shell-words.js";
import { applyTextEdits } from "./text-edits.js";

/**
 * Makefiles. Make expands its variables before a recipe line reaches the shell, so a variable can
 * hold the generator command: `OAT := openapi-typescript`, then `$(OAT) a.yaml -it`. The value of
 * an assignment is read as a command and migrated where it is set, with the text that earlier
 * assignments of its value hold (make-values.ts); the flags after a reference to such a variable,
 * or to one set to it (`GEN := $(OAT)`), are migrated where it is used. The arguments of
 * `$(or …)`, `$(and …)` and `$(if …)` are command lines where they are written
 * (make-expansions.ts). Text that a recipe appends on a sub-make's command line
 * (`$(MAKE) -C api GEN+=-it`) is read as make passes it on (make-calls.ts). Everything else is
 * shell text.
 */

const startOf = (command: ShellCommand): number => command[0]?.start ?? -1;

const isInValue = (command: ShellCommand, { valueStart, valueEnd }: MakeAssignment): boolean =>
  valueStart <= startOf(command) && startOf(command) < valueEnd;

/** The commands that start in the value of each assignment, by its index, in order. */
function assignmentPieces(
  commands: readonly ShellCommand[],
  assignments: readonly MakeAssignment[],
): Map<number, ShellCommand[]> {
  return new Map(
    assignments.map((assignment, index) => [
      index,
      commands
        .filter((command) => isInValue(command, assignment))
        .sort((left, right) => startOf(left) - startOf(right)),
    ]),
  );
}

/** The words of each assignment's value, also those of its make functions, in order. */
const assignmentWords = (
  pieces: ReadonlyMap<number, readonly ShellCommand[]>,
  functions: ReadonlyMap<number, readonly ShellCommand[]>,
): Map<number, ShellCommand> =>
  new Map(
    [...pieces].map(([index, commands]) => [
      index,
      [...commands, ...(functions.get(index) ?? [])]
        .flat()
        .sort((left, right) => left.start - right.start),
    ]),
  );

/** How make reads a Makefile: its assignments, their values and its rules, and its commands. */
interface ReadMakefile extends MakeReading {
  readonly commands: readonly ShellCommand[];
  readonly functions: readonly ShellCommand[];
}

function makeReading(text: string): ReadMakefile {
  const assignments = makeAssignments(text);
  const commands = shellCommands(withoutAssignmentHeads(maskExpansions(text), assignments));
  const functions = functionCommands(text);
  const pieces = assignmentPieces(commands, assignments);
  const words = assignmentWords(pieces, assignmentPieces(functions, assignments));
  const targets = makeTargets(text);
  const values = makeValues({ assignments, conditionals: makeConditionals(text), targets });
  return { text, assignments, pieces, words, values, targets, commands, functions };
}

/** The names that a Makefile sets by `override` in place of a sub-make's command-line value. */
export function commandLineReplacements(text: string): Set<string> {
  const assignments = makeAssignments(text);
  const file = { assignments, conditionals: makeConditionals(text), targets: makeTargets(text) };
  const names = new Set(assignments.filter(({ isOverride }) => isOverride).map(({ name }) => name));
  return new Set([...names].filter((name) => replacesCommandLine(file, name)));
}

/**
 * The commands read as they are written: recipes and other shell text, and the command lines in
 * make functions, except those in the value of an assignment read as a part of a longer value.
 */
function writtenCommands(reading: ReadMakefile, parts: readonly number[]): ShellCommand[] {
  const inValues = new Set([...reading.pieces.values()].flat());
  const partAssignments = parts.flatMap((index) => reading.assignments[index] ?? []);
  const isInPart = (command: ShellCommand): boolean =>
    partAssignments.some((assignment) => isInValue(command, assignment));
  return [
    ...reading.commands.filter((command) => !inValues.has(command)),
    ...reading.functions.filter((command) => !isInPart(command)),
  ];
}

/** Migrate a Makefile; each finding names its `file:line`. */
export function migrateMakefile(
  text: string,
  file: string,
  called: CalledMakefiles = NO_CALLED_MAKEFILES,
): CommandMigration {
  const lineOf = lineLocator(text);
  const reading = makeReading(text);
  const readings = assignmentReadings(reading);
  const written = writtenCommands(reading, readings.parts);
  const exported = (name: string, offset: number) => exportedProgram(reading, name, offset);
  const calls = makeCallAppends(written, { text, file, called, exported });
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const { edits, changes, manualSteps } = commandWordFindings(
    [...written, ...readings.commands],
    locate,
    makefileVariables(reading),
    [...readings.appended, ...calls],
  );
  const steps = [...manualSteps, ...unreadCallSteps(text, locate)];
  return { text: applyTextEdits(text, edits), changes, manualSteps: steps };
}
