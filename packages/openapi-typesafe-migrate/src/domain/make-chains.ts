import type { MakeAssignment } from "./make-lines.js";

/**
 * The values a Makefile variable can have, and how one assignment changes them: `=`, `:=` and
 * `!=` set a value, `+=` appends text to the one the variable has, `?=` sets one only when the
 * variable has none, and a plain assignment leaves a value that `override` or the command line
 * set (make-values.ts reads a whole file with them).
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
export type MakeState = ReadonlyMap<string, MakeAlternatives>;

/**
 * The value of a variable that the file does not set: whatever comes from outside. Text appended
 * to it makes a new value, so a value is unset only while it is this one.
 */
export const UNSET_CHAIN: MakeChain = { segments: [{ kind: "outside" }], isProtected: false };
export const UNSET_VALUE: MakeAlternatives = [UNSET_CHAIN];
/** A value that make computes where the tool does not read it: by `$(eval …)` or `$(shell …)`. */
export const COMPUTED_CHAIN: MakeChain = { segments: [{ kind: "computed" }], isProtected: false };
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
export function appliedChain(
  chain: MakeChain,
  assignment: MakeAssignment,
  index: number,
): MakeChain[] {
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

export const uniqueChains = (chains: readonly MakeChain[]): MakeChain[] => [
  ...new Map(chains.map((chain) => [JSON.stringify(chain), chain])).values(),
];

/** Whether a value ends with the text of the assignment at `index`. */
export function endsWith({ segments }: MakeChain, index: number): boolean {
  const last = segments.at(-1);
  return last?.kind === "piece" && last.index === index;
}

/** An assignment with its place in the file's list, and whether a conditional holds it. */
export interface IndexedAssignment {
  readonly assignment: MakeAssignment;
  readonly index: number;
  readonly isConditional: boolean;
}

/** The values after `list` is applied in order; each records the values that end with it. */
export function appliedAll(
  start: MakeAlternatives,
  list: readonly IndexedAssignment[],
  endings: Map<number, MakeChain[]>,
): MakeAlternatives {
  let values = start;
  for (const { assignment, index, isConditional } of list) {
    const applied = values.flatMap((chain) => appliedChain(chain, assignment, index));
    const ending = applied.filter((chain) => endsWith(chain, index));
    endings.set(index, uniqueChains([...(endings.get(index) ?? []), ...ending]));
    values = uniqueChains(isConditional ? [...values, ...applied] : applied);
  }
  return values;
}
