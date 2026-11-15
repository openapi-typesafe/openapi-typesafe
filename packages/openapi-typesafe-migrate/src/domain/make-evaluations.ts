import { EVAL, type FunctionCall, functionArguments } from "./make-expansions.js";
import { type MakeLines, readMakeLines } from "./make-lines.js";

/**
 * The text that `$(eval …)` reads as Makefile text: its argument (`$(eval GEN := npx …)`), and
 * the value of each variable the argument references (`define RULE … endef`, then
 * `$(eval $(RULE))` or `$(eval $(call RULE,x))`). The assignments in it are Makefile
 * assignments, marked as evaluated: make runs them where it expands the call, which the tool
 * does not follow, so the variables they set may have their values anywhere (make-values.ts).
 */

/** A reference in an eval argument: `$(NAME)`, `${NAME}`, `$(call NAME,…)`, `$(value NAME)`. */
const REFERENCED_NAME_RE = /\$[({](?:(?:call|value)[ \t]+)?([^\s:#=$(){},]+)/g;

/** What `$(eval …)` reads: the call arguments, and the lines of all evaluated text. */
export interface EvaluatedText {
  readonly calls: readonly FunctionCall[];
  readonly lines: Pick<MakeLines, "assignments" | "hidden">;
}

/**
 * The evaluated text of a Makefile; `plain` is the text without make's comments and directives,
 * where the calls are looked for.
 */
export function evaluatedText(text: string, plain: string, lines: MakeLines): EvaluatedText {
  const calls = functionArguments(plain, EVAL);
  const names = new Set(
    calls.flatMap(({ start, end }) =>
      [...plain.slice(start, end).matchAll(REFERENCED_NAME_RE)].map((match) => match[1] as string),
    ),
  );
  const values = lines.assignments
    .filter((assignment) => names.has(assignment.name))
    .map(({ valueStart, valueEnd }) => ({ start: valueStart, end: valueEnd }));
  const read = [...calls, ...values].map(({ start, end }) =>
    readMakeLines(text, { from: start, to: end, isEvaluated: true }),
  );
  return {
    calls,
    lines: {
      assignments: read.flatMap(({ assignments }) => assignments),
      hidden: read.flatMap(({ hidden }) => hidden),
    },
  };
}
