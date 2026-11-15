import type { MakeRule } from "./make-lines.js";

/**
 * The rules of a Makefile: which targets a recipe line builds, and which targets need others
 * built first. A variable set for some targets only (`gen: GEN += -it`) is the value in their
 * recipes, and make gives it to the prerequisites it builds for them too. Make expands a
 * reference in a target or prerequisite list (`$(LINT_TARGETS): GEN = grep`) before it reads
 * the rule, so such a list may name any target: the tool does not compute it.
 */

/** `%` in a target matches any text: a pattern rule or a pattern-specific variable. */
const PATTERN = "%";
/** A reference in a written target: make expands it to names the tool does not know. */
const REFERENCE = "$";
const SPECIAL_CHARACTERS_RE = /[.*+?^${}()|[\]\\]/g;

/** Whether a written target names a target: surely, perhaps (a reference), or not. */
export type TargetMatch = "always" | "maybe" | "never";

/**
 * Whether a target as written in an assignment (`gen`, `%.ts`, `$(TARGETS)`) names the target
 * `name` of a rule, written there with references too.
 */
export function targetMatches(written: string, name: string): TargetMatch {
  if (written.includes(REFERENCE) || name.includes(REFERENCE)) {
    return "maybe";
  }
  if (!written.includes(PATTERN)) {
    return written === name ? "always" : "never";
  }
  const parts = written.split(PATTERN).map((part) => part.replace(SPECIAL_CHARACTERS_RE, "\\$&"));
  return new RegExp(`^${parts.join(".*")}$`).test(name) ? "always" : "never";
}

/** What the rules of a Makefile say about where a text is and which targets need which. */
export interface MakeTargets {
  /** The targets whose recipe holds the offset, or undefined outside a recipe. */
  readonly recipeTargets: (offset: number) => readonly string[] | undefined;
  /**
   * The targets that have `target` among their prerequisites, however deep, also those whose
   * prerequisite list has a reference, which may name it. Their assignments give the values when
   * make builds `target` for them; it can build it alone too, so each is one more alternative.
   */
  readonly dependents: (target: string) => ReadonlySet<string>;
}

/** The targets of the rules that list `target` among their prerequisites, surely or perhaps. */
const needing = (rules: readonly MakeRule[], target: string): string[] =>
  rules.flatMap((rule) =>
    rule.prerequisites.some((name) => targetMatches(name, target) !== "never") ? rule.targets : [],
  );

/** The dependents of `target`, however deep. */
function dependentsOf(rules: readonly MakeRule[], target: string): ReadonlySet<string> {
  const found = new Set<string>();
  for (let added = [target]; added.length > 0; ) {
    const next = added.flatMap((name) => needing(rules, name)).filter((name) => !found.has(name));
    for (const name of next) {
      found.add(name);
    }
    added = [...new Set(next)];
  }
  return found;
}

const holds = ({ start, end }: { start: number; end: number }, offset: number): boolean =>
  start <= offset && offset <= end;

/** The targets of a Makefile, from its rules. */
export function makeTargets(rules: readonly MakeRule[]): MakeTargets {
  const recipeTargets = (offset: number): readonly string[] | undefined =>
    rules.find(
      (rule) => holds(rule, offset) || rule.recipes.some((recipe) => holds(recipe, offset)),
    )?.targets;
  return { recipeTargets, dependents: (target) => dependentsOf(rules, target) };
}
