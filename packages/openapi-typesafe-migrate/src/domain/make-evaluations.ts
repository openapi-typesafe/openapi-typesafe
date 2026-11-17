import { EVAL, type FunctionCall, functionArguments } from "./make-expansions.js";
import type { TextRange } from "./make-line-text.js";
import { type MakeLines, readMakeLines } from "./make-lines.js";

/**
 * The text that `$(eval …)` reads as Makefile text: its argument (`$(eval GEN := npx …)`), and
 * the value of each variable the argument references (`define RULE … endef`, then
 * `$(eval $(RULE))` or `$(eval $(call RULE,x))`). The assignments in it are Makefile
 * assignments, marked as evaluated: make runs them where it expands the call, which the tool
 * does not follow, so the variables they set may have their values anywhere (make-values.ts).
 * Make expands that text once before eval reads it, which turns `$$` into `$`: `$$(GEN)` in a
 * template is a reference to `GEN` in the text eval reads. A `$(value NAME)` gives the value
 * unexpanded, so its `$$` stays.
 */

/** A reference in an eval argument: `$(NAME)`, `${NAME}`, `$(call NAME,…)`, `$(value NAME)`. */
const REFERENCED_NAME_RE = /\$[({](?:(call|value)[ \t]+)?([^\s:#=$(){},]+)/g;
const VALUE_FUNCTION = "value";
/** A run of two or more `$`: make reads its pairs from the left, each `$$` an escaped `$`. */
const DOLLAR_RUN_RE = /\$\$+/g;
const DOLLAR = "$";
const BLANK = " ";

/** What `$(eval …)` reads: the call arguments, and the lines of all evaluated text. */
export interface EvaluatedText {
  readonly calls: readonly FunctionCall[];
  readonly lines: Pick<MakeLines, "assignments" | "hidden">;
  /** Where make expands the evaluated text before eval reads it. */
  readonly expanded: readonly TextRange[];
}

/** The names that eval arguments reference, and whether each is expanded (not `value`). */
function referencedNames(plain: string, calls: readonly FunctionCall[]): Map<string, boolean> {
  const names = new Map<string, boolean>();
  for (const { start, end } of calls) {
    for (const [, function_, name] of plain.slice(start, end).matchAll(REFERENCED_NAME_RE)) {
      const isExpanded = function_ !== VALUE_FUNCTION;
      names.set(name as string, (names.get(name as string) ?? false) || isExpanded);
    }
  }
  return names;
}

/**
 * The evaluated text of a Makefile; `plain` is the text without make's comments and directives,
 * where the calls are looked for.
 */
export function evaluatedText(text: string, plain: string, lines: MakeLines): EvaluatedText {
  const calls = functionArguments(plain, EVAL);
  const names = referencedNames(plain, calls);
  const values = lines.assignments
    .filter((assignment) => names.has(assignment.name))
    .map(({ name, valueStart, valueEnd }) => ({ name, start: valueStart, end: valueEnd }));
  const read = [...calls, ...values].map(({ start, end }) =>
    readMakeLines(text, { from: start, to: end, isEvaluated: true }),
  );
  const expandedValues = values.filter(({ name }) => names.get(name) === true);
  return {
    calls,
    lines: {
      assignments: read.flatMap(({ assignments }) => assignments),
      hidden: read.flatMap(({ hidden }) => hidden),
    },
    expanded: [...calls, ...expandedValues].map(({ start, end }) => ({ start, end })),
  };
}

/**
 * A run of `$` as make's expansion leaves it: each pair from the left is one `$`, and an odd last
 * `$` starts a reference. The blanks that keep the offsets go before the run, so the `$` that are
 * left stay next to the text they expand: `$$$$GEN` is `  $$GEN`, the shell's `$GEN` in a recipe.
 */
function expandedRun(run: string): string {
  const pairs = Math.floor(run.length / 2);
  return `${BLANK.repeat(pairs)}${DOLLAR.repeat(run.length - pairs)}`;
}

/** The text with each `$$` in `ranges` as the `$` that make's expansion leaves there. */
export function withExpandedEscapes(text: string, ranges: readonly TextRange[]): string {
  let expanded = text;
  for (const { start, end } of ranges) {
    const range = expanded.slice(start, end).replace(DOLLAR_RUN_RE, expandedRun);
    expanded = `${expanded.slice(0, start)}${range}${expanded.slice(end)}`;
  }
  return expanded;
}
