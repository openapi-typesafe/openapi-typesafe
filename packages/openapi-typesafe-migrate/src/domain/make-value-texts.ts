import type { MakeAlternatives } from "./make-chains.js";
import { referenceEnd } from "./make-line-text.js";
import type { MakeAssignment } from "./make-lines.js";
import { type MakeFile, makeValues } from "./make-values.js";

/**
 * The text that make expands a reference to, where the tool can know it: an `include` line is
 * expanded when make reads it, with the values that the text before it gives
 * (`include $(MK)/tools.mk` after `MK := mk`). A variable has a known text when the lines read so
 * far give it one value made of assignments only (make-values.ts), not a value from outside
 * the file (the environment, the command line, an include the tool cannot read), a branch of a
 * conditional or `$(eval …)`. A simple variable (`:=`, `::=`) expands each part where it is
 * assigned, a recursive one (`=`) where it is used. A function call (`$(dir …)`), a substitution
 * (`$(A:.c=.o)`), a computed name and make's own variables (`$(CURDIR)`) have no known text.
 */

/** The text of each variable where make reads a line, or undefined when it is not known. */
export type ValueText = (name: string) => string | undefined;

const DOLLAR = "$";
const CLOSING: Readonly<Record<string, string>> = { "(": ")", "{": "}" };
const SIMPLE_OPERATORS: ReadonlySet<string> = new Set([":=", "::="]);
const RECURSIVE_OPERATORS: ReadonlySet<string> = new Set(["=", "?=", "+="]);
/** A backslash and the line break it continues, which make reads as one blank in a value. */
const CONTINUATION_RE = /[ \t]*\\\n[ \t]*/g;
const BLANK = " ";
const LEADING_BLANKS_RE = /^[ \t]+/;

/** The name that the reference starting at `start` reads, and where it ends, or undefined. */
function referenceAt(text: string, start: number): { name: string; end: number } | undefined {
  const open = text[start + 1] ?? "";
  const close = CLOSING[open];
  const end = referenceEnd(text, start, text.length);
  if (close !== undefined && text[end - 1] !== close) {
    return undefined;
  }
  // A function call or a substitution (`$(dir x)`, `$(A:.c=.o)`) names no variable that an
  // assignment can set, so it has no text either.
  const name = close === undefined ? text.slice(start + 1, end) : text.slice(start + 2, end - 1);
  return { name, end };
}

/** The text with its references expanded by `valueOf`, or undefined when one is not known. */
export function expandedText(text: string, textOfName: ValueText): string | undefined {
  const parts: string[] = [];
  let index = 0;
  for (let at = text.indexOf(DOLLAR); at !== -1; at = text.indexOf(DOLLAR, index)) {
    parts.push(text.slice(index, at));
    if (text[at + 1] === DOLLAR) {
      parts.push(DOLLAR);
      index = at + 2;
      continue;
    }
    const reference = referenceAt(text, at);
    const value = reference === undefined ? undefined : textOfName(reference.name);
    if (reference === undefined || value === undefined) {
      return undefined;
    }
    parts.push(value);
    index = reference.end;
  }
  parts.push(text.slice(index));
  return parts.join("");
}

/** The values of a variable at one place of the text. */
type ValuesAt = (name: string) => MakeAlternatives;

/** How the values of the joined text are read: its assignments, and the values at each one. */
interface ValueReading {
  readonly text: string;
  readonly assignments: readonly MakeAssignment[];
  readonly before: (index: number) => ValuesAt;
}

/**
 * The text of the assignment at `index` as make keeps it: without the blanks before it, with the
 * blanks after it (make keeps them), and its continued lines joined by a blank.
 */
function pieceText(reading: ValueReading, index: number): string {
  const { valueStart, valueEnd } = reading.assignments[index] as MakeAssignment;
  const written = reading.text.slice(valueStart, valueEnd).replace(CONTINUATION_RE, BLANK);
  return written.replace(LEADING_BLANKS_RE, "");
}

/** The assignments that make the one value in `values`, or undefined for another value. */
function soleValuePieces(values: MakeAlternatives): number[] | undefined {
  const [chain, ...others] = values;
  const pieces = chain?.segments.flatMap((segment) =>
    segment.kind === "piece" ? [segment.index] : [],
  );
  return others.length === 0 && pieces?.length === chain?.segments.length ? pieces : undefined;
}

/** The texts of all `parts` joined by a blank, as `+=` appends, or undefined for one unknown. */
const joinedTexts = (parts: readonly (string | undefined)[]): string | undefined =>
  parts.every((part) => part !== undefined) ? parts.join(BLANK) : undefined;

/**
 * The text of `name` with the values `valuesAt` gives where it is used. `seen` holds the
 * recursive variables being expanded: one that references itself has no text, as make stops on
 * it. A simple variable's parts are expanded with the values before each of them, which are
 * earlier in the text, so their expansion ends.
 */
function textOf(
  reading: ValueReading,
  name: string,
  valuesAt: ValuesAt,
  seen: ReadonlySet<string>,
): string | undefined {
  const pieces = seen.has(name) ? undefined : soleValuePieces(valuesAt(name));
  const operator = reading.assignments[pieces?.[0] ?? -1]?.operator ?? "";
  if (pieces !== undefined && SIMPLE_OPERATORS.has(operator)) {
    return joinedTexts(
      pieces.map((index) =>
        expandedText(pieceText(reading, index), (other) =>
          textOf(reading, other, reading.before(index), new Set()),
        ),
      ),
    );
  }
  if (pieces === undefined || !RECURSIVE_OPERATORS.has(operator)) {
    return undefined;
  }
  const inner = new Set([...seen, name]);
  return expandedText(pieces.map((index) => pieceText(reading, index)).join(BLANK), (other) =>
    textOf(reading, other, valuesAt, inner),
  );
}

/** The names that the references of a text read, each once, in order. */
export function referencedNames(text: string): string[] {
  const names = new Set<string>();
  // `$$` reads as the name `$`, which no assignment sets.
  for (let at = text.indexOf(DOLLAR); at !== -1; ) {
    const reference = referenceAt(text, at);
    if (reference !== undefined) {
      names.add(reference.name);
    }
    at = text.indexOf(DOLLAR, reference?.end ?? at + 1);
  }
  return [...names];
}

/** The text of each variable at the end of `text`, whose values `file` gives (make-values.ts). */
export function valueTextsOf(text: string, file: MakeFile): ValueText {
  const values = makeValues(file);
  const reading: ValueReading = {
    text,
    assignments: file.assignments,
    before: (index) => (name) => values.before(index, name),
  };
  return (name) => textOf(reading, name, values.final, new Set());
}
