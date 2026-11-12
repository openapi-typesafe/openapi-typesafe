/**
 * GitHub Actions expressions in shell text (`${{ inputs.gen || 'npx openapi-typescript' }}`).
 * The runner puts the value of an expression into the script before the shell runs, so a string
 * literal of the expression is command text where it is written, the "overridable command" idiom
 * of reusable workflows. The rest of the expression (an input, a matrix value) is known only to
 * the run.
 */

/** A string literal of an expression: its text between the quotes, and where that text starts. */
export interface ExpressionLiteral {
  readonly text: string;
  readonly start: number;
}

/** In shell text `${{` is a bad substitution, so no valid shell text holds one otherwise. */
const EXPRESSION_OPEN = "${{";
const EXPRESSION_CLOSE = "}}";
const LITERAL_QUOTE = "'";
const SHELL_SINGLE_QUOTE = "'";
const BACKSLASH = "\\";
const DOUBLE_QUOTE = '"';

/**
 * The end of the expression at `start`, after the `}}` that closes it, or undefined when none
 * does. Its string literals are skipped whole; `''` in one reads as its end and a new start.
 */
function expressionEnd(text: string, start: number): number | undefined {
  for (let index = start + EXPRESSION_OPEN.length; index < text.length; ) {
    if (text.startsWith(EXPRESSION_CLOSE, index)) {
      return index + EXPRESSION_CLOSE.length;
    }
    const close = text[index] === LITERAL_QUOTE ? text.indexOf(LITERAL_QUOTE, index + 1) : index;
    index = close === -1 ? text.length : close + 1;
  }
  return undefined;
}

/**
 * The string literals between `start` and `end` of `raw`. A literal with an escaped quote (`''`)
 * is left out: its value is not the text as written, so its offsets would not map onto the text.
 */
function literalsIn(raw: string, start: number, end: number): ExpressionLiteral[] {
  const found: ExpressionLiteral[] = [];
  let open = raw.indexOf(LITERAL_QUOTE, start);
  while (open !== -1 && open < end) {
    let close = raw.indexOf(LITERAL_QUOTE, open + 1);
    let isEscaped = false;
    while (close !== -1 && raw[close + 1] === LITERAL_QUOTE) {
      isEscaped = true;
      close = raw.indexOf(LITERAL_QUOTE, close + 2);
    }
    if (close === -1) {
      break;
    }
    found.push(...(isEscaped ? [] : [{ text: raw.slice(open + 1, close), start: open + 1 }]));
    open = raw.indexOf(LITERAL_QUOTE, close + 1);
  }
  return found;
}

/**
 * The string literals of the expressions in a word as written, outside shell single quotes: a
 * value put inside them is data for the program, not a command.
 */
export function expressionLiterals(raw: string): ExpressionLiteral[] {
  const found: ExpressionLiteral[] = [];
  for (let index = 0; index < raw.length; ) {
    if (raw[index] === SHELL_SINGLE_QUOTE) {
      const close = raw.indexOf(SHELL_SINGLE_QUOTE, index + 1);
      index = close === -1 ? raw.length : close + 1;
    } else if (raw[index] === BACKSLASH) {
      index += 2;
    } else if (raw.startsWith(EXPRESSION_OPEN, index)) {
      const end = expressionEnd(raw, index) ?? raw.length;
      found.push(...literalsIn(raw, index + EXPRESSION_OPEN.length, end));
      index = end;
    } else {
      index += 1;
    }
  }
  return found;
}

/** Whether a word is one expression as a whole, also in double quotes: `"${{ inputs.gen }}"`. */
export function isWholeExpression(raw: string): boolean {
  const isQuoted = raw.length > 1 && raw.startsWith(DOUBLE_QUOTE) && raw.endsWith(DOUBLE_QUOTE);
  const inner = isQuoted ? 1 : 0;
  return raw.startsWith(EXPRESSION_OPEN, inner) && expressionEnd(raw, inner) === raw.length - inner;
}
