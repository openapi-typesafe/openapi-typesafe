/**
 * The rules of a Makefile: which targets a recipe line builds, and which targets need others
 * built first. A variable set for some targets only (`gen: GEN += -it`) is the value in their
 * recipes, and make gives it to the prerequisites it builds for them too.
 */

/** A rule header: targets, a `:` or `::` that no `=` follows, then the prerequisites. */
const RULE_RE = /^([^\s#:=][^:#=\n]*?)[ \t]*::?(?!=)([^\n]*)$/gm;
/** An assignment operator in the rest of a rule line: the line sets a variable for the targets. */
const ASSIGNMENT_IN_RULE_RE = /^[^;]*?(?::::=|::=|:=|\?=|\+=|!=|=)/;
/** The prerequisites end where an inline recipe (`gen: ; cmd`) starts. */
const RECIPE_SEPARATOR = ";";
/** `|` puts order-only prerequisites after the normal ones; both are built first. */
const ORDER_ONLY = "|";
const BLANKS_RE = /\s+/;
const LINE_BREAK = "\n";
const RECIPE_PREFIX = "\t";
/** `%` in a target matches any text: a pattern rule or a pattern-specific variable. */
const PATTERN = "%";
const SPECIAL_CHARACTERS_RE = /[.*+?^${}()|[\]\\]/g;

interface MakeRule {
  readonly start: number;
  readonly targets: readonly string[];
  readonly prerequisites: readonly string[];
}

const wordsOf = (text: string): string[] => text.split(BLANKS_RE).filter((word) => word !== "");

/** The rule headers of a Makefile, in order. */
function makeRules(text: string): MakeRule[] {
  return [...text.matchAll(RULE_RE)].flatMap((match) => {
    const rest = match[2] as string;
    if (ASSIGNMENT_IN_RULE_RE.test(rest)) {
      return [];
    }
    const prerequisites = wordsOf(rest.split(RECIPE_SEPARATOR)[0] ?? "").filter(
      (word) => word !== ORDER_ONLY,
    );
    return [{ start: match.index, targets: wordsOf(match[1] as string), prerequisites }];
  });
}

/** Whether a target as written (`gen`, `%.ts`) names the target `name`. */
export function targetMatches(written: string, name: string): boolean {
  if (!written.includes(PATTERN)) {
    return written === name;
  }
  const parts = written.split(PATTERN).map((part) => part.replace(SPECIAL_CHARACTERS_RE, "\\$&"));
  return new RegExp(`^${parts.join(".*")}$`).test(name);
}

/** What the rules of a Makefile say about where a text is and which targets need which. */
export interface MakeTargets {
  /** The targets whose recipe holds the offset, or undefined outside a recipe. */
  readonly recipeTargets: (offset: number) => readonly string[] | undefined;
  /** The targets that have `target` among their prerequisites, however deep. */
  readonly dependents: (target: string) => ReadonlySet<string>;
}

/** Whether the line that holds `offset` is a recipe line, or the rule line itself. */
function isInRule(text: string, rule: MakeRule, offset: number): boolean {
  const lineStart = text.lastIndexOf(LINE_BREAK, offset - 1) + 1;
  return lineStart === rule.start || text.startsWith(RECIPE_PREFIX, lineStart);
}

/** The targets of a Makefile, from its rule headers. */
export function makeTargets(text: string): MakeTargets {
  const rules = makeRules(text);
  const recipeTargets = (offset: number): readonly string[] | undefined => {
    const rule = rules.filter(({ start }) => start <= offset).at(-1);
    return rule !== undefined && isInRule(text, rule, offset) ? rule.targets : undefined;
  };
  const dependents = (target: string): ReadonlySet<string> => {
    const found = new Set<string>();
    for (let added = [target]; added.length > 0; ) {
      const next = rules
        .filter((rule) => rule.prerequisites.some((name) => added.includes(name)))
        .flatMap((rule) => rule.targets)
        .filter((name) => !found.has(name));
      for (const name of next) {
        found.add(name);
      }
      added = next;
    }
    return found;
  };
  return { recipeTargets, dependents };
}
