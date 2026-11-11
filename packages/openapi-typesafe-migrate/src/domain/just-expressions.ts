/**
 * The literals of just expressions: in a variable's value (`gen := env_var_or_default("GEN",
 * "npx openapi-typescript")`), in a recipe parameter's default (`types gen="npx …":`) and in an
 * interpolation (`{{ "npx …" }}`). A string can become command text of a recipe line, and a
 * backtick is a command that just runs, so their text is read as command lines where it is
 * written. Which literal an expression evaluates to (an `if`, a function call, the environment)
 * is known only when just runs.
 */

/** A string literal or a backtick, with the place of its text between the delimiters. */
export interface JustLiteral {
  readonly kind: "string" | "backtick";
  /** The offset of the opening delimiter. */
  readonly start: number;
  /** The offset after the closing delimiter. */
  readonly end: number;
  readonly contentStart: number;
  /** The text between the delimiters as written: an escape (`\"`) stays two characters. */
  readonly content: string;
}

/** The delimiters of just, the indented (tripled) forms first. */
const DELIMITERS: readonly string[] = ['"""', "'''", "```", '"', "'", "`"];
const BACKTICK = "`";
/** The one delimiter in which just reads escapes, so `\"` does not end the string. */
const ESCAPING_DELIMITER = '"';
const ESCAPE = "\\";
const COMMENT_START = "#";
const LINE_BREAK = "\n";

/** The end of the text that a delimiter at `from` closes, or undefined when it is not closed. */
function closingOffset(text: string, delimiter: string, from: number): number | undefined {
  if (delimiter !== ESCAPING_DELIMITER) {
    const close = text.indexOf(delimiter, from);
    return close === -1 ? undefined : close;
  }
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (char === ESCAPE) {
      index += 1;
    } else if (char === ESCAPING_DELIMITER || char === LINE_BREAK) {
      return char === ESCAPING_DELIMITER ? index : undefined;
    }
  }
  return undefined;
}

/** The literal that starts at `offset`, or undefined when none does. */
export function literalAt(text: string, offset: number): JustLiteral | undefined {
  const delimiter = DELIMITERS.find((candidate) => text.startsWith(candidate, offset));
  if (delimiter === undefined) {
    return undefined;
  }
  const contentStart = offset + delimiter.length;
  const close = closingOffset(text, delimiter, contentStart);
  if (close === undefined) {
    return undefined;
  }
  const kind = delimiter.startsWith(BACKTICK) ? "backtick" : "string";
  const content = text.slice(contentStart, close);
  return { kind, start: offset, end: close + delimiter.length, contentStart, content };
}

/** The literals of an expression and the offset where it ends. */
export interface JustExpression {
  readonly literals: readonly JustLiteral[];
  readonly end: number;
}

/**
 * The expression from `start` to the end of its line, before a comment: a literal that spans
 * lines (`"""…"""`) moves the end to the line where it closes.
 */
export function expressionAt(text: string, start: number): JustExpression {
  const literals: JustLiteral[] = [];
  let index = start;
  while (index < text.length && text[index] !== LINE_BREAK && text[index] !== COMMENT_START) {
    const literal = literalAt(text, index);
    literals.push(...(literal === undefined ? [] : [literal]));
    index = literal?.end ?? index + 1;
  }
  return { literals, end: index };
}

/** The literals between `start` and `end`, which no literal crosses (a parameter default). */
export function literalsBetween(text: string, start: number, end: number): JustLiteral[] {
  const literals: JustLiteral[] = [];
  for (let index = start; index < end; ) {
    const literal = literalAt(text, index);
    literals.push(...(literal === undefined ? [] : [literal]));
    index = literal?.end ?? index + 1;
  }
  return literals;
}

/** An interpolation of a recipe line, `{{…}}`, with the literals of its expression. */
export interface JustInterpolation {
  readonly start: number;
  readonly end: number;
  readonly literals: readonly JustLiteral[];
}

const INTERPOLATION_OPEN = "{{";
const INTERPOLATION_CLOSE = "}}";

/** The interpolation that opens at `start`, or undefined when its line does not close it. */
function interpolationAt(text: string, start: number): JustInterpolation | undefined {
  const literals: JustLiteral[] = [];
  for (let index = start + INTERPOLATION_OPEN.length; index < text.length; ) {
    if (text.startsWith(INTERPOLATION_CLOSE, index)) {
      return { start, end: index + INTERPOLATION_CLOSE.length, literals };
    }
    if (text[index] === LINE_BREAK) {
      return undefined;
    }
    const literal = literalAt(text, index);
    literals.push(...(literal === undefined ? [] : [literal]));
    index = literal?.end ?? index + 1;
  }
  return undefined;
}

/** The interpolations of a text in order; a `}}` inside a literal does not close one. */
export function interpolationsOf(text: string): JustInterpolation[] {
  const found: JustInterpolation[] = [];
  for (let open = text.indexOf(INTERPOLATION_OPEN); open !== -1; ) {
    const interpolation = interpolationAt(text, open);
    found.push(...(interpolation === undefined ? [] : [interpolation]));
    const next = interpolation?.end ?? open + INTERPOLATION_OPEN.length;
    open = text.indexOf(INTERPOLATION_OPEN, next);
  }
  return found;
}
