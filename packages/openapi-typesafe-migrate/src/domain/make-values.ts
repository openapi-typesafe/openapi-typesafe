import type { MakeAssignment, MakeConditional } from "./make-assignments.js";
import { type MakeTargets, targetMatches } from "./make-rules.js";

/**
 * The values of the variables of a Makefile, as make builds them. Make reads the whole file
 * before it runs a recipe, in order: `=`, `:=` and `!=` set a value, `+=` appends text to the one
 * the variable has, `?=` sets one only when the variable has none (the environment may give it
 * one), and a plain assignment leaves a value that `override` or the command line set. So
 * `G := npx` and `G += openapi-typescript` are one value, `npx openapi-typescript`. Only the
 * branches of a conditional (`ifeq … else … endif`) and values from outside the file give a
 * variable alternatives. An assignment for some targets (`gen: G += -it`) changes the value in
 * their recipes, and in those of the prerequisites make builds for them.
 */

/**
 * One part of a value: the text of an assignment, a value from outside the file (the
 * environment, an included file), the output of a shell command (`!=`), or the command line of
 * a sub-make, which is outside the file too.
 */
export type MakeSegment =
  | { readonly kind: "piece"; readonly index: number }
  | { readonly kind: "outside" }
  | { readonly kind: "computed" }
  | { readonly kind: "command-line" };

/** One value a variable can have: its parts in order, and whether a plain assignment leaves it. */
export interface MakeChain {
  readonly segments: readonly MakeSegment[];
  readonly isProtected: boolean;
}

export type MakeAlternatives = readonly MakeChain[];
type MakeState = ReadonlyMap<string, MakeAlternatives>;

/**
 * The value of a variable that the file does not set: whatever comes from outside. Text appended
 * to it makes a new value, so a value is unset only while it is this one.
 */
const UNSET_CHAIN: MakeChain = { segments: [{ kind: "outside" }], isProtected: false };
export const UNSET_VALUE: MakeAlternatives = [UNSET_CHAIN];
/** A variable that a sub-make gets on its command line, which plain assignments leave. */
export const COMMAND_LINE_VALUE: MakeAlternatives = [
  { segments: [{ kind: "command-line" }], isProtected: true },
];

const APPEND = "+=";
const CONDITIONAL = "?=";
const SHELL = "!=";

/**
 * The values that one assignment makes of one value its variable has. Only an override changes
 * a protected value, and the value it makes stays protected.
 */
function appliedChain(chain: MakeChain, assignment: MakeAssignment, index: number): MakeChain[] {
  if (chain.isProtected && !assignment.isOverride) {
    return [chain];
  }
  const isProtected = assignment.isOverride;
  const piece: MakeSegment = { kind: "piece", index };
  switch (assignment.operator) {
    case APPEND:
      return [{ segments: [...chain.segments, piece], isProtected }];
    case CONDITIONAL:
      return chain === UNSET_CHAIN ? [{ segments: [piece], isProtected }, chain] : [chain];
    case SHELL:
      return [{ segments: [{ kind: "computed" }], isProtected }];
    default:
      return [{ segments: [piece], isProtected }];
  }
}

const uniqueChains = (chains: readonly MakeChain[]): MakeChain[] => [
  ...new Map(chains.map((chain) => [JSON.stringify(chain), chain])).values(),
];

/** An assignment with its place in the file's list, and whether a conditional holds it. */
interface IndexedAssignment {
  readonly assignment: MakeAssignment;
  readonly index: number;
  readonly isConditional: boolean;
}

/** The values after `list` is applied in order; each records the values that end with it. */
function appliedAll(
  start: MakeAlternatives,
  list: readonly IndexedAssignment[],
  endings: Map<number, MakeChain[]>,
): MakeAlternatives {
  let values = start;
  for (const { assignment, index, isConditional } of list) {
    const applied = values.flatMap((chain) => appliedChain(chain, assignment, index));
    const ending = applied.filter(({ segments }) => {
      const last = segments.at(-1);
      return last?.kind === "piece" && last.index === index;
    });
    endings.set(index, uniqueChains([...(endings.get(index) ?? []), ...ending]));
    values = uniqueChains(isConditional ? [...values, ...applied] : applied);
  }
  return values;
}

/** A conditional block that make is reading: the values before it, and of its closed branches. */
interface Frame {
  readonly before: MakeState;
  readonly branches: MakeState[];
  hasElse: boolean;
}

/** The values after a conditional block, from each of its branches. */
function closed(state: MakeState, frame: Frame): MakeState {
  const branches = [...frame.branches, state, ...(frame.hasElse ? [] : [frame.before])];
  const names = new Set(branches.flatMap((branch) => [...branch.keys()]));
  const merged = [...names].map((name): [string, MakeAlternatives] => [
    name,
    uniqueChains(branches.flatMap((branch) => branch.get(name) ?? UNSET_VALUE)),
  ]);
  return new Map(merged);
}

/** The values after a conditional directive. */
function afterConditional(state: MakeState, frames: Frame[], { kind }: MakeConditional) {
  if (kind === "if") {
    frames.push({ before: state, branches: [], hasElse: false });
    return state;
  }
  const frame = kind === "endif" ? frames.pop() : frames.at(-1);
  if (frame === undefined) {
    return state;
  }
  if (kind === "endif") {
    return closed(state, frame);
  }
  frame.branches.push(state);
  frame.hasElse ||= kind === "else";
  return frame.before;
}

/** What make has read of a file: values, the state before each assignment, the endings. */
interface ReadFile {
  readonly state: MakeState;
  readonly before: ReadonlyMap<number, MakeState>;
  readonly endings: Map<number, MakeChain[]>;
  readonly conditional: ReadonlySet<number>;
}

type MakeEvent =
  | { readonly start: number; readonly conditional: MakeConditional }
  | { readonly start: number; readonly index: number };

/** The state after an assignment for all targets; one for some targets leaves it. */
function withAssignment(
  state: MakeState,
  assignment: MakeAssignment,
  index: number,
  endings: Map<number, MakeChain[]>,
): MakeState {
  if (assignment.targets !== undefined) {
    return state;
  }
  const list = [{ assignment, index, isConditional: false }];
  const values = appliedAll(state.get(assignment.name) ?? UNSET_VALUE, list, endings);
  return new Map(state).set(assignment.name, values);
}

/** The assignments and conditional directives of a file, in the order make reads them. */
const fileEvents = (
  assignments: readonly MakeAssignment[],
  conditionals: readonly MakeConditional[],
): MakeEvent[] =>
  [
    ...conditionals.map((conditional) => ({ start: conditional.start, conditional })),
    ...assignments.map((assignment, index) => ({ start: assignment.start, index })),
  ].sort((left, right) => left.start - right.start);

/** Read the assignments for all targets in order, through the conditional blocks. */
function readFile(
  assignments: readonly MakeAssignment[],
  conditionals: readonly MakeConditional[],
  initial: MakeState,
): ReadFile {
  const before = new Map<number, MakeState>();
  const endings = new Map<number, MakeChain[]>();
  const conditional = new Set<number>();
  const frames: Frame[] = [];
  let state = initial;
  for (const event of fileEvents(assignments, conditionals)) {
    if ("conditional" in event) {
      state = afterConditional(state, frames, event.conditional);
    } else {
      before.set(event.index, state);
      if (frames.length > 0) {
        conditional.add(event.index);
      }
      state = withAssignment(
        state,
        assignments[event.index] as MakeAssignment,
        event.index,
        endings,
      );
    }
  }
  for (let frame = frames.pop(); frame !== undefined; frame = frames.pop()) {
    state = closed(state, frame);
  }
  return { state, before, endings, conditional };
}

/** The values of the variables of a Makefile. */
export interface MakeValues {
  /** The values a variable has after make read the file, outside the recipes of a target. */
  readonly final: (name: string) => MakeAlternatives;
  /** The values a variable has where make reads the assignment at `index`. */
  readonly before: (index: number, name: string) => MakeAlternatives;
  /** The values in the recipes of `targets`, with the assignments for them. */
  readonly inTargets: (targets: readonly string[], name: string) => MakeAlternatives;
  /** The values that the assignment at `index` makes, which end with its own text. */
  readonly ending: (index: number) => readonly MakeChain[];
}

/** What the values of a Makefile are read from. */
export interface MakeFile {
  readonly assignments: readonly MakeAssignment[];
  readonly conditionals: readonly MakeConditional[];
  readonly targets: MakeTargets;
}

/** The values of a variable in the recipes of one target. */
type TargetValues = (target: string, name: string) => MakeAlternatives;

/**
 * The values in the recipes of a target: the file's, then its own assignments for it; or, when
 * make builds it for a target that needs it, that target's assignments before its own, except
 * the private ones.
 */
function targetValues(file: MakeFile, read: ReadFile, final: (name: string) => MakeAlternatives) {
  const indexed = file.assignments.map((assignment, index) => ({
    assignment,
    index,
    isConditional: read.conditional.has(index),
  }));
  const forTarget = (name: string, target: string, isInherited: boolean) =>
    indexed.filter(
      ({ assignment }) =>
        assignment.name === name &&
        (assignment.targets ?? []).some((written) => targetMatches(written, target)) &&
        !(isInherited && assignment.isPrivate),
    );
  const inTarget: TargetValues = (target, name) => {
    const own = forTarget(name, target, false);
    const inherited = [...file.targets.dependents(target)].map((dependent) => [
      ...forTarget(name, dependent, true),
      ...own,
    ]);
    return uniqueChains(
      [own, ...inherited].flatMap((list) => appliedAll(final(name), list, read.endings)),
    );
  };
  return inTarget;
}

/** The values of the variables of a Makefile; `initial` gives values the file starts with. */
export function makeValues(file: MakeFile, initial: MakeState = new Map()): MakeValues {
  const read = readFile(file.assignments, file.conditionals, initial);
  const final = (name: string): MakeAlternatives => read.state.get(name) ?? UNSET_VALUE;
  const inTarget = targetValues(file, read, final);
  // Each assignment for some targets is read once in their recipes, so its endings are known.
  for (const assignment of file.assignments) {
    for (const target of assignment.targets ?? []) {
      inTarget(target, assignment.name);
    }
  }
  return {
    final,
    before: (index, name) => read.before.get(index)?.get(name) ?? UNSET_VALUE,
    inTargets: (targets, name) => uniqueChains(targets.flatMap((target) => inTarget(target, name))),
    ending: (index) => read.endings.get(index) ?? [],
  };
}

/**
 * Whether the file sets `name` by `override` in place of a value that a sub-make gets on its
 * command line, in every branch, so text the command line appends to it (`GEN+=-it`) is lost.
 * An override for some targets only leaves the value in the others.
 */
export function replacesCommandLine(file: MakeFile, name: string): boolean {
  const overrides = file.assignments.filter(
    (assignment) => assignment.name === name && assignment.isOverride,
  );
  if (overrides.length === 0 || overrides.some(({ targets }) => targets !== undefined)) {
    return false;
  }
  const values = makeValues(file, new Map([[name, COMMAND_LINE_VALUE]])).final(name);
  return values.every(({ segments }) => segments.every(({ kind }) => kind !== "command-line"));
}
