import { isOwnGeneratorCommand } from "./appended-assignments.js";
import type { AppendedValue } from "./argument-findings.js";
import type { FileVariables } from "./file-variables.js";
import { isExported } from "./make-assignments.js";
import {
  alternativesProgramOf,
  chainCommands,
  chainProgram,
  hasWords,
  isComputed,
  lookupAt,
  type MakeReading,
  referencedName,
} from "./make-programs.js";
import type { MakeChain } from "./make-values.js";
import type { ShellCommand, ShellWord } from "./shell-words.js";
import type { ValueProgram, VariableProgram } from "./variable-programs.js";

/**
 * What the commands of a Makefile read of its variables: which program `$(GEN)` runs where it is
 * used, and how the text of each assignment is read. The text that starts a value is a command
 * of its own; text appended to a value of the file is read with the parts before it, as one
 * command (`npx`, then `openapi-typescript -it`); text appended to a value from outside the file
 * holds arguments of a program the tool does not know.
 */

/** The values each variable gets in the file, joined: any of them can reach a command. */
function variableValues({ text, assignments }: MakeReading): Map<string, string> {
  const values = new Map<string, string>();
  for (const { name, valueStart, valueEnd } of assignments) {
    const value = text.slice(valueStart, valueEnd);
    values.set(name, [values.get(name), value].filter((part) => part !== undefined).join(" "));
  }
  return values;
}

/** What `name` runs where `offset` is. */
export const programIn = (reading: MakeReading, name: string, offset: number): VariableProgram => {
  const lookup = lookupAt(reading, offset);
  return alternativesProgramOf(lookup(name), reading, lookup);
};

/**
 * What a variable that the recipe at `offset` gives to the programs it runs holds there, or
 * undefined when make does not export it, so a program gets it from outside the file.
 */
export const exportedProgram = (
  reading: MakeReading,
  name: string,
  offset: number,
): VariableProgram | undefined =>
  isExported(reading.text, reading.assignments, name)
    ? programIn(reading, name, offset)
    : undefined;

/** The variables of a Makefile, read from the values its assignments build. */
export function makefileVariables(reading: MakeReading): FileVariables {
  const { text } = reading;
  const values = variableValues(reading);
  const nameAt = (word: ShellWord) => referencedName(text.slice(word.start, word.end));
  return {
    programAt: (program) => {
      const written = text.slice(program.start, program.end);
      const name = nameAt(program);
      if (name === undefined) {
        return isComputed(written) ? { written, program: "generator-or-other" } : undefined;
      }
      return { written, program: programIn(reading, name, program.start) };
    },
    referenceAt: (word) => {
      const name = nameAt(word);
      const value = name === undefined ? undefined : values.get(name);
      const written = text.slice(word.start, word.end);
      return value === undefined ? undefined : { written, value };
    },
  };
}

/**
 * How one value that ends with an assignment's text reads that text: as commands, with what the
 * value runs and whether the text is a part after others, or, after a value from outside the
 * file, as arguments of a program the tool does not know (none, when the text runs the
 * generator itself, `GEN += npx openapi-typescript`).
 */
type ChainReading =
  | { readonly kind: "outside" }
  | {
      readonly kind: "commands";
      readonly program: ValueProgram;
      readonly commands: ShellCommand[];
      readonly isPart: boolean;
    };

function chainReading(chain: MakeChain, index: number, reading: MakeReading): ChainReading {
  const own = reading.pieces.get(index) ?? [];
  const before = chain.segments.slice(0, -1);
  const first = before.find((segment) => hasWords(segment, reading.pieces));
  const isAfterOutside = first !== undefined && first.kind !== "piece";
  if (isAfterOutside && !isOwnGeneratorCommand("after-outside", own[0])) {
    return { kind: "outside" };
  }
  const assignment = reading.assignments[index];
  const deferred =
    assignment?.targets === undefined
      ? reading.values.final
      : lookupAt(reading, assignment.valueStart);
  const program = chainProgram(chain, reading, deferred);
  const commands = chainCommands(chain, reading, deferred);
  return { kind: "commands", program, commands, isPart: first?.kind === "piece" };
}

/**
 * What the text of the assignments of a Makefile gives the command migration. `parts` are the
 * assignments read as parts of a value after others, whose make functions' command lines are
 * read there as arguments, not as commands of their own.
 */
export interface AssignmentReadings {
  readonly commands: readonly ShellCommand[];
  readonly appended: readonly AppendedValue[];
  readonly parts: readonly number[];
}

/** The text of an assignment as arguments of a program that may be another one. */
function appendedToOther(index: number, reading: MakeReading): AppendedValue {
  const words = reading.words.get(index) ?? [];
  const written = `$(${reading.assignments[index]?.name ?? ""})`;
  return { words, program: { written, program: "generator-or-other" } };
}

/**
 * How the text of the assignment at `index` is read. The values that end with it may start
 * otherwise (a conditional before it); when they run different programs, its words are
 * reported, as arguments of a program that may be the generator or another one. A text that
 * ends no value (a `!=` command, which make runs where it reads it, or a plain assignment that
 * an override leaves) is read as the command it is.
 */
function assignmentReading(index: number, reading: MakeReading): AssignmentReadings {
  const own = reading.pieces.get(index) ?? [];
  const chains = reading.values.ending(index);
  if (chains.length === 0) {
    return { commands: own, appended: [], parts: [] };
  }
  const readings = chains.map((chain) => chainReading(chain, index, reading));
  const joined = readings.flatMap((found) => (found.kind === "commands" ? [found] : []));
  const programs = new Set(joined.map(({ program }) => program));
  if (joined.length < readings.length || programs.size > 1) {
    return { commands: [], appended: [appendedToOther(index, reading)], parts: [index] };
  }
  const commands = joined.flatMap((found) => found.commands);
  return { commands, appended: [], parts: joined.some(({ isPart }) => isPart) ? [index] : [] };
}

/** How the text of every assignment of a Makefile is read. */
export function assignmentReadings(reading: MakeReading): AssignmentReadings {
  const all = reading.assignments.map((_, index) => assignmentReading(index, reading));
  return {
    commands: all.flatMap(({ commands }) => commands),
    appended: all.flatMap(({ appended }) => appended),
    parts: all.flatMap(({ parts }) => parts),
  };
}
