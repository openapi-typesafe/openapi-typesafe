import {
  appliedAll,
  appliedChain,
  COMMAND_LINE_VALUE,
  COMPUTED_CHAIN,
  endsWith,
  type IndexedAssignment,
  type MakeAlternatives,
  type MakeChain,
  type MakeState,
  UNSET_CHAIN,
  UNSET_VALUE,
  uniqueChains,
} from "./make-chains.js";
import type { MakeAssignment, MakeConditional } from "./make-lines.js";
import { type MakeTargets, targetMatches } from "./make-rules.js";

/**
 * The values of the variables of a Makefile, as make builds them. Make reads the whole file
 * before it runs a recipe, in order: `=`, `:=` and `!=` set a value, `+=` appends text to the one
 * the variable has, `?=` sets one only when the variable has none (the environment may give it
 * one), and a plain assignment leaves a value that `override` or the command line set. So
 * `G := npx` and `G += openapi-typescript` are one value, `npx openapi-typescript`. Only the
 * branches of a conditional (`ifeq … else … endif`) and values from outside the file give a
 * variable alternatives. An assignment for some targets (`gen: G += -it`) changes the value in
 * their recipes, and in those of the prerequisites make builds for them. An `include` of a file
 * the tool cannot read, and text that `$(eval …)` reads, may set a variable to any value.
 */

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
  | { readonly start: number; readonly index: number }
  | { readonly start: number; readonly include: true };

/**
 * The state after an assignment for all targets. One for some targets leaves it, and so does one
 * that `$(eval …)` reads: its text starts a value of its own, read where make expands the call.
 */
function withAssignment(
  state: MakeState,
  assignment: MakeAssignment,
  index: number,
  endings: Map<number, MakeChain[]>,
): MakeState {
  if (assignment.isEvaluated) {
    const applied = appliedChain(UNSET_CHAIN, assignment, index);
    endings.set(
      index,
      applied.filter((chain) => endsWith(chain, index)),
    );
    return state;
  }
  if (assignment.targets !== undefined) {
    return state;
  }
  const list = [{ assignment, index, isConditional: false }];
  const values = appliedAll(state.get(assignment.name) ?? UNSET_VALUE, list, endings);
  return new Map(state).set(assignment.name, values);
}

/** The state after an `include` of a file the tool cannot read, which may set any variable. */
const afterUnreadInclude = (state: MakeState): MakeState =>
  new Map([...state].map(([name, values]) => [name, uniqueChains([...values, UNSET_CHAIN])]));

/** The assignments, conditional directives and unread includes of a file, in make's order. */
const fileEvents = (file: MakeFile): MakeEvent[] =>
  [
    ...file.conditionals.map((conditional) => ({ start: conditional.start, conditional })),
    ...file.assignments.map((assignment, index) => ({ start: assignment.start, index })),
    ...file.unreadIncludes.map(({ start }) => ({ start, include: true as const })),
  ].sort((left, right) => left.start - right.start);

/** Read the assignments for all targets in order, through the conditional blocks. */
function readFile(file: MakeFile, initial: MakeState): ReadFile {
  const before = new Map<number, MakeState>();
  const endings = new Map<number, MakeChain[]>();
  const conditional = new Set<number>();
  const frames: Frame[] = [];
  let state = initial;
  for (const event of fileEvents(file)) {
    if ("conditional" in event) {
      state = afterConditional(state, frames, event.conditional);
    } else if ("include" in event) {
      state = afterUnreadInclude(state);
    } else {
      before.set(event.index, state);
      if (frames.length > 0) {
        conditional.add(event.index);
      }
      const assignment = file.assignments[event.index] as MakeAssignment;
      state = withAssignment(state, assignment, event.index, endings);
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
  /** The `include` lines whose files the tool cannot read. */
  readonly unreadIncludes: readonly { readonly start: number }[];
  readonly targets: MakeTargets;
}

/** The values of a variable in the recipes of one target. */
type TargetValues = (target: string, name: string) => MakeAlternatives;

/**
 * The assignments of `name` for `target`, without the private ones for a target it is built
 * for. One whose targets may name it (`$(TARGETS): G = x`) may set the value or not.
 */
function assignmentsFor(
  indexed: readonly IndexedAssignment[],
  name: string,
  target: string,
  isInherited: boolean,
): IndexedAssignment[] {
  return indexed.flatMap((entry) => {
    const { assignment } = entry;
    const isSkipped = assignment.isEvaluated || (isInherited && assignment.isPrivate);
    if (assignment.name !== name || isSkipped) {
      return [];
    }
    const matches = (assignment.targets ?? []).map((written) => targetMatches(written, target));
    const isSure = matches.includes("always");
    const isApplied = isSure || matches.includes("maybe");
    return isApplied ? [{ ...entry, isConditional: entry.isConditional || !isSure }] : [];
  });
}

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
  const inTarget: TargetValues = (target, name) => {
    const own = assignmentsFor(indexed, name, target, false);
    const inherited = [...file.targets.dependents(target)].map((dependent) => [
      ...assignmentsFor(indexed, name, dependent, true),
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
  const read = readFile(file, initial);
  const evaluated = new Set(
    file.assignments.filter((one) => one.isEvaluated).map(({ name }) => name),
  );
  // A variable that evaluated text sets may have that value anywhere: make reads the text where
  // it expands the call, which can be in a recipe, after the whole file.
  const withEvaluated = (name: string, values: MakeAlternatives): MakeAlternatives =>
    evaluated.has(name) ? uniqueChains([...values, COMPUTED_CHAIN]) : values;
  const final = (name: string): MakeAlternatives =>
    withEvaluated(name, read.state.get(name) ?? UNSET_VALUE);
  const inTarget = targetValues(file, read, final);
  // Each assignment for some targets is read once in their recipes, so its endings are known.
  for (const assignment of file.assignments) {
    for (const target of assignment.targets ?? []) {
      inTarget(target, assignment.name);
    }
  }
  return {
    final,
    before: (index, name) => withEvaluated(name, read.before.get(index)?.get(name) ?? UNSET_VALUE),
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
