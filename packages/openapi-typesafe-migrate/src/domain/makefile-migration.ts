import type { AppendedValue } from "./argument-findings.js";
import { type CommandMigration, commandWordFindings } from "./command-migration.js";
import { blanked, shellText, withoutMakeText } from "./make-assignments.js";
import { type CalledMakefiles, makeCallAppends, NO_CALLED_MAKEFILES } from "./make-calls.js";
import { evaluatedText } from "./make-evaluations.js";
import {
  type FunctionCall,
  functionCommands,
  maskExpansions,
  unreadCallSteps,
} from "./make-expansions.js";
import { type IncludedFiles, type MakefileSource, withIncludedFiles } from "./make-includes.js";
import { type MakeAssignment, type MakeLines, readMakeLines } from "./make-lines.js";
import type { MakeReading } from "./make-programs.js";
import { makeTargets } from "./make-rules.js";
import { type MakeFile, makeValues, replacesCommandLine } from "./make-values.js";
import { assignmentReadings, exportedProgram, makefileVariables } from "./make-variables.js";
import { lineLocator } from "./migration-findings.js";
import { type ShellCommand, shellCommands } from "./shell-words.js";
import { applyTextEdits, type TextEdit } from "./text-edits.js";

/**
 * Makefiles. Make expands its variables before a recipe line reaches the shell, so a variable can
 * hold the generator command: `OAT := openapi-typescript`, then `$(OAT) a.yaml -it`. The lines
 * are read as make reads them (make-lines.ts), with the files the Makefile includes
 * (make-includes.ts) and the text `$(eval …)` reads (make-evaluations.ts). The value of an
 * assignment is read as a command and migrated where it is set, with the text that earlier
 * assignments of its value hold (make-values.ts); the flags after a reference to such a variable,
 * or to one set to it (`GEN := $(OAT)`), are migrated where it is used. The arguments of
 * `$(or …)`, `$(and …)` and `$(if …)` are command lines where they are written
 * (make-expansions.ts). Text that a recipe appends on a sub-make's command line
 * (`$(MAKE) -C api GEN+=-it`) is read as make passes it on (make-calls.ts). Recipes and the
 * values of assignments are shell text; comments and directives are make's own.
 */

const startOf = (command: ShellCommand): number => command[0]?.start ?? -1;

const isInValue = (command: ShellCommand, { valueStart, valueEnd }: MakeAssignment): boolean =>
  valueStart <= startOf(command) && startOf(command) < valueEnd;

/**
 * The commands that start in the value of each assignment, by its index, in order. A command in
 * evaluated text inside a value (`define RULE`, its `GEN := …`) is the inner assignment's.
 */
function assignmentPieces(
  commands: readonly ShellCommand[],
  assignments: readonly MakeAssignment[],
): Map<number, ShellCommand[]> {
  const pieces = new Map(assignments.map((_, index): [number, ShellCommand[]] => [index, []]));
  for (const command of [...commands].sort((left, right) => startOf(left) - startOf(right))) {
    const index = assignments.findLastIndex((assignment) => isInValue(command, assignment));
    pieces.get(index)?.push(command);
  }
  return pieces;
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

/** The lines of a Makefile with the text `$(eval …)` reads, and the text without make's own. */
function allLines(source: MakefileSource) {
  const { text, fileStarts } = source;
  const lines = readMakeLines(text, { fileStarts });
  const plain = withoutMakeText(text, lines);
  const evaluated = evaluatedText(text, plain, lines);
  const assignments = [...lines.assignments, ...evaluated.lines.assignments].sort(
    (left, right) => left.start - right.start,
  );
  const hidden = [...lines.hidden, ...evaluated.lines.hidden];
  return { lines: { ...lines, assignments, hidden }, plain, calls: evaluated.calls };
}

/** What make reads of a Makefile's values: the lines become the input of make-values.ts. */
const makeFile = (lines: MakeLines): MakeFile => ({
  assignments: lines.assignments,
  conditionals: lines.conditionals,
  unreadIncludes: lines.includes,
  targets: makeTargets(lines.rules),
});

/** How make reads a Makefile: its assignments, their values and its rules, and its commands. */
interface ReadMakefile extends MakeReading {
  readonly commands: readonly ShellCommand[];
  readonly functions: readonly ShellCommand[];
  readonly plain: string;
  readonly evaluatedCalls: readonly FunctionCall[];
}

function makeReading(source: MakefileSource): ReadMakefile {
  const { text } = source;
  const { lines, plain, calls } = allLines(source);
  const { assignments } = lines;
  const commands = shellCommands(shellText(maskExpansions(text, calls), lines));
  const functions = functionCommands(plain);
  const pieces = assignmentPieces(commands, assignments);
  const words = assignmentWords(pieces, assignmentPieces(functions, assignments));
  const file = makeFile(lines);
  const values = makeValues(file);
  return {
    text,
    lines,
    assignments,
    pieces,
    words,
    values,
    targets: file.targets,
    commands,
    functions,
    plain,
    evaluatedCalls: calls,
  };
}

/** The names that a Makefile sets by `override` in place of a sub-make's command-line value. */
export function commandLineReplacements(
  text: string,
  path: string,
  files: IncludedFiles = NO_CALLED_MAKEFILES,
): Set<string> {
  const { lines } = allLines(withIncludedFiles(text, path, files));
  const names = new Set(
    lines.assignments.filter(({ isOverride }) => isOverride).map(({ name }) => name),
  );
  const file = makeFile(lines);
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

/** An edit of the joined text as an edit of the Makefile itself, or undefined for another file. */
function ownEdit(edit: TextEdit, source: MakefileSource): TextEdit | undefined {
  const start = source.ownOffset(edit.start);
  const last = source.ownOffset(Math.max(edit.start, edit.end - 1));
  return start === undefined || last === undefined
    ? undefined
    : { start, end: edit.end > edit.start ? last + 1 : start, text: edit.text };
}

/** The commands and appended values of the Makefile itself: an included file is migrated alone. */
function ownInputs(source: MakefileSource, commands: ShellCommand[], appended: AppendedValue[]) {
  const isOwn = (command: ShellCommand) => source.ownOffset(startOf(command)) !== undefined;
  return {
    commands: commands.filter(isOwn),
    appended: appended.filter(({ words }) => isOwn(words)),
  };
}

/**
 * The calls of functions whose value the tool does not read, in the Makefile itself. The text of
 * an eval call is read as Makefile text, so the calls around it do not hide it.
 */
function unreadSteps(
  reading: ReadMakefile,
  source: MakefileSource,
  locate: (offset: number) => string,
) {
  const text = blanked(
    reading.plain,
    reading.evaluatedCalls.map(({ call }) => call),
  );
  return unreadCallSteps(text, locate, (offset) => source.ownOffset(offset) !== undefined);
}

/** Migrate a Makefile; each finding names its `file:line`. */
export function migrateMakefile(
  text: string,
  file: string,
  called: CalledMakefiles = NO_CALLED_MAKEFILES,
): CommandMigration {
  const lineOf = lineLocator(text);
  const source = withIncludedFiles(text, file, called);
  const reading = makeReading(source);
  const readings = assignmentReadings(reading);
  const written = writtenCommands(reading, readings.parts);
  const exported = (name: string, offset: number) => exportedProgram(reading, name, offset);
  const calls = makeCallAppends(written, { text: source.text, file, called, exported });
  const locate = (offset: number): string => `${file}:${lineOf(source.ownOffset(offset) ?? 0)}`;
  const own = ownInputs(
    source,
    [...written, ...readings.commands],
    [...readings.appended, ...calls],
  );
  const { edits, changes, manualSteps } = commandWordFindings(
    own.commands,
    locate,
    makefileVariables(reading),
    own.appended,
  );
  const ownEdits = edits.flatMap((edit) => ownEdit(edit, source) ?? []);
  const unread = unreadSteps(reading, source, locate);
  return {
    text: applyTextEdits(text, ownEdits),
    changes,
    manualSteps: [...manualSteps, ...unread],
  };
}
