import { commandRoles } from "./command-roles.js";
import { runsGenerator } from "./file-variables.js";
import type { MakeAlternatives, MakeChain, MakeSegment } from "./make-chains.js";
import type { MakeAssignment, MakeLines } from "./make-lines.js";
import type { MakeTargets } from "./make-rules.js";
import type { MakeValues } from "./make-values.js";
import type { ShellCommand } from "./shell-words.js";
import {
  alternativesProgram,
  type ValueProgram,
  type VariableProgram,
} from "./variable-programs.js";

/**
 * Which program a value of a Makefile variable runs. Its parts are joined as make joins them, so
 * the first command of the value can start in one assignment and go on in the next (`G := npx`,
 * then `G += openapi-typescript`). A reference to a variable at the start (`GEN := $(OAT)`) runs
 * what that variable holds: where make reads the assignment for an immediate one (`:=`), where
 * the value is used for a recursive one (`=`).
 */

/**
 * A reference to one variable, as a whole word: `$(NAME)`, `${NAME}`, or `$N` for a variable whose
 * name is one letter, as make reads a `$` before any other character.
 */
const VARIABLE_REFERENCE_RE =
  /^\$(?:\(([A-Za-z_][A-Za-z0-9_.-]*)\)|\{([A-Za-z_][A-Za-z0-9_.-]*)\}|([A-Za-z_]))$/;
/** `@`, `-` and `+` before a recipe line: silent, ignore errors, always run. */
const RECIPE_PREFIX_RE = /^[@+-]+/;
/** A make expansion at the start of a word: a reference or a function call such as `$(or …)`. */
const COMPUTED_RE = /^\$[({]/;
/** The operators that expand their value where make reads the assignment. */
const IMMEDIATE_OPERATORS: ReadonlySet<string> = new Set([":=", "::=", ":::="]);

/** The variable that `written` references as a whole, after the recipe prefix, or undefined. */
export function referencedName(written: string): string | undefined {
  const match = VARIABLE_REFERENCE_RE.exec(written.trim().replace(RECIPE_PREFIX_RE, ""));
  return match === null ? undefined : (match[1] ?? match[2] ?? match[3]);
}

/**
 * Whether a word starts with a make expansion that is not a plain reference (`$(or $(GEN),npx
 * openapi-typescript)`, `$(shell …)`): make computes the program, which may be the generator.
 */
export const isComputed = (written: string): boolean =>
  COMPUTED_RE.test(written.trim().replace(RECIPE_PREFIX_RE, ""));

/** What a Makefile's values are read with: the file, its assignments and their commands. */
export interface MakeReading {
  readonly text: string;
  readonly lines: MakeLines;
  readonly assignments: readonly MakeAssignment[];
  /** The commands that start in the value of each assignment, by its index, in order. */
  readonly pieces: ReadonlyMap<number, readonly ShellCommand[]>;
  /**
   * The words of each assignment's value as arguments, by its index, in order: those of its
   * commands and of the command lines in its make functions (`$(if $(CI),-it)`).
   */
  readonly words: ReadonlyMap<number, ShellCommand>;
  readonly values: MakeValues;
  readonly targets: MakeTargets;
}

/** The values of a variable, by its name, in one place of the file. */
export type ValueLookup = (name: string) => MakeAlternatives;

/** The commands of the parts of a value, the last command of a part going on in the next. */
export function joinedCommands(
  segments: readonly MakeSegment[],
  { pieces, words }: Pick<MakeReading, "pieces" | "words">,
): ShellCommand[] {
  const joined: ShellCommand[] = [];
  for (const segment of segments) {
    const last = joined.at(-1);
    if (segment.kind !== "piece") {
      continue;
    }
    if (last === undefined) {
      joined.push(...(pieces.get(segment.index) ?? []));
    } else {
      joined[joined.length - 1] = [...last, ...(words.get(segment.index) ?? [])];
    }
  }
  return joined;
}

/** Whether a part of a value has words: a value from outside or a computed one may have any. */
export const hasWords = (segment: MakeSegment, pieces: MakeReading["pieces"]): boolean =>
  segment.kind !== "piece" || (pieces.get(segment.index) ?? []).length > 0;

const asValueProgram = (program: VariableProgram): ValueProgram =>
  program === "generator-or-other" ? "run-time" : program;

/** Where the names of a value are looked up: its own, and those of a recursive value. */
interface Lookups {
  readonly own: ValueLookup;
  readonly deferred: ValueLookup;
}

/** The first command of a value, and where its names are looked up. */
interface FirstCommand {
  readonly words: ShellCommand;
  readonly lookups: Lookups;
}

/**
 * The first command of a value, from its first part with words: undefined for an empty value,
 * "run-time" for one from outside the file or computed, whose words the tool does not know.
 */
function firstCommand(
  chain: MakeChain,
  reading: MakeReading,
  deferred: ValueLookup,
): FirstCommand | "run-time" | undefined {
  const start = chain.segments.findIndex((segment) => hasWords(segment, reading.pieces));
  const first = chain.segments[start];
  if (first === undefined || first.kind !== "piece") {
    return first === undefined ? undefined : "run-time";
  }
  const [words = []] = joinedCommands(chain.segments.slice(start), reading);
  const operator = reading.assignments[first.index]?.operator ?? "";
  const own = IMMEDIATE_OPERATORS.has(operator)
    ? (name: string) => reading.values.before(first.index, name)
    : deferred;
  return { words, lookups: { own, deferred } };
}

/**
 * What a command of a value runs. A reference as its program word (`$(NPX) openapi-typescript`,
 * `G := $(G) openapi-typescript`) is replaced by the first command of each value the variable
 * has, as make expands it, so the program can come from either side.
 */
function wordsProgram(
  words: ShellCommand,
  reading: MakeReading,
  lookups: Lookups,
  visiting: ReadonlySet<string>,
): ValueProgram {
  const { program = 0 } = commandRoles(words);
  const word = words[program];
  const written = word === undefined ? "" : reading.text.slice(word.start, word.end);
  const target = referencedName(written);
  if (target === undefined) {
    return isComputed(written) ? "run-time" : runsGenerator(words) ? "generator" : "other";
  }
  if (visiting.has(target)) {
    return "other";
  }
  const inner = new Set([...visiting, target]);
  const programs = lookups.own(target).map((chain): ValueProgram => {
    const found = firstCommand(chain, reading, lookups.deferred) ?? { words: [], lookups };
    if (found === "run-time") {
      return found;
    }
    const joined = [...words.slice(0, program), ...found.words, ...words.slice(program + 1)];
    return wordsProgram(joined, reading, found.lookups, inner);
  });
  return asValueProgram(alternativesProgram(programs));
}

/**
 * A command of a value with the reference that is its program word replaced as make expands it
 * (`G := $(G) openapi-typescript` after `G := npx`), so its words are read with the program they
 * run. When the variable's values run different programs, or one the tool cannot read, the
 * command stays as written, and the reference says which program it may be.
 */
function expandedCommands(
  words: ShellCommand,
  reading: MakeReading,
  lookups: Lookups,
  visiting: ReadonlySet<string>,
): ShellCommand[] {
  const { program = 0 } = commandRoles(words);
  const word = words[program];
  const target = referencedName(word === undefined ? "" : reading.text.slice(word.start, word.end));
  if (target === undefined || visiting.has(target)) {
    return [words];
  }
  const found = lookups
    .own(target)
    .map((chain) => firstCommand(chain, reading, lookups.deferred) ?? { words: [], lookups });
  const known = found.flatMap((variant) => (variant === "run-time" ? [] : [variant]));
  const joined = known.map((variant) => ({
    words: [...words.slice(0, program), ...variant.words, ...words.slice(program + 1)],
    lookups: variant.lookups,
  }));
  const inner = new Set([...visiting, target]);
  const programs = new Set(
    joined.map((one) => wordsProgram(one.words, reading, one.lookups, inner)),
  );
  if (known.length < found.length || programs.size !== 1) {
    return [words];
  }
  return joined.flatMap((one) => expandedCommands(one.words, reading, one.lookups, inner));
}

/** The commands of a value, its first one with a leading reference expanded. */
export function chainCommands(
  chain: MakeChain,
  reading: MakeReading,
  deferred: ValueLookup,
): ShellCommand[] {
  const joined = joinedCommands(chain.segments, reading);
  const [first, ...rest] = joined;
  const found = firstCommand(chain, reading, deferred);
  if (first === undefined || found === undefined || found === "run-time") {
    return joined;
  }
  return [...expandedCommands(first, reading, found.lookups, new Set()), ...rest];
}

/** What a value runs; `deferred` gives the values of the variables a recursive value uses. */
export function chainProgram(
  chain: MakeChain,
  reading: MakeReading,
  deferred: ValueLookup,
  visiting: ReadonlySet<string> = new Set(),
): ValueProgram {
  const found = firstCommand(chain, reading, deferred);
  if (found === undefined) {
    return "other";
  }
  return found === "run-time" ? found : wordsProgram(found.words, reading, found.lookups, visiting);
}

/** What a variable runs from its values. */
export const alternativesProgramOf = (
  alternatives: MakeAlternatives,
  reading: MakeReading,
  deferred: ValueLookup,
  visiting: readonly string[] = [],
): VariableProgram =>
  alternativesProgram(
    alternatives.map((chain) => chainProgram(chain, reading, deferred, new Set(visiting))),
  );

/** The index of the innermost assignment whose value holds `offset`, or -1. */
const assignmentAt = (reading: MakeReading, offset: number): number =>
  reading.assignments.findLastIndex(
    ({ valueStart, valueEnd }) => valueStart <= offset && offset < valueEnd,
  );

/**
 * The values of the variables where `offset` is: in a recipe, those of its targets; in the value
 * of an immediate assignment, those where make reads it; in the value of another assignment for
 * some targets, those of the targets; elsewhere those of the whole file.
 */
export function lookupAt(reading: MakeReading, offset: number): ValueLookup {
  const { values } = reading;
  const index = assignmentAt(reading, offset);
  const assignment = reading.assignments[index];
  if (assignment !== undefined && IMMEDIATE_OPERATORS.has(assignment.operator)) {
    return (name) => values.before(index, name);
  }
  const targets =
    assignment === undefined ? reading.targets.recipeTargets(offset) : assignment.targets;
  return targets === undefined ? values.final : (name) => values.inTargets(targets, name);
}
