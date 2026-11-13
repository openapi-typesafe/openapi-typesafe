import { type JustLiteral, literalAt, literalsBetween } from "./just-expressions.js";

/**
 * The parameters of justfile recipes: `types gen="npx openapi-typescript" *args:`. A parameter is
 * a variable of its recipe's lines (`{{gen}}`), set by its default or by the command line
 * (`just types other`), so its value can always be another program.
 */

/** A parameter with a default: its name, the literals of the default, the variable it names. */
export interface ParameterDefault {
  readonly name: string;
  /** Whether the recipe exports it to its shell (`$name=…`), which reads it as `$name`. */
  readonly isExported: boolean;
  readonly literals: readonly JustLiteral[];
  /** The variable that the default is (`gen=other`), or undefined for another expression. */
  readonly target: string | undefined;
}

/** A recipe's header up to its colon, which just reads and no shell does. */
export interface RecipeHeader {
  readonly start: number;
  readonly end: number;
  readonly defaults: readonly ParameterDefault[];
}

/** The recipe name at the start of a line, with the quiet `@` prefix. */
const RECIPE_NAME_RE = /^@?[A-Za-z_][A-Za-z0-9_-]*(?=[ \t:])/gm;
/** One parameter: its kind prefix (`+`, `*`, `$`), its name and its default. */
const PARAMETER_RE = /^([+*$]*)([A-Za-z_][A-Za-z0-9_-]*)(?:=([\s\S]*))?$/;
const EXPORT_PREFIX = "$";
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const COLON = ":";
const EQUALS = "=";
const OPEN_PAREN = "(";
const CLOSE_PAREN = ")";
const COMMENT_START = "#";
const LINE_BREAK = "\n";
const BLANK_RE = /[ \t]/;

/** How a character changes the depth of parentheses. */
const depthChange = (char: string | undefined): number =>
  char === OPEN_PAREN ? 1 : char === CLOSE_PAREN ? -1 : 0;

/** A word of the parameter list: its place, literals and parentheses kept whole. */
interface ParameterWord {
  readonly start: number;
  readonly end: number;
}

/**
 * The colon that ends the header that starts at `from`, or undefined when the line is not a
 * header: `:=` (a `set` or an `alias`) or a comment comes first, or the line has no colon.
 */
function headerColon(text: string, from: number): number | undefined {
  for (let index = from; index < text.length && text[index] !== LINE_BREAK; ) {
    const literal = literalAt(text, index);
    const char = text[index];
    if (literal !== undefined) {
      index = literal.end;
      continue;
    }
    if (char === COMMENT_START || (char === COLON && text[index + 1] === EQUALS)) {
      return undefined;
    }
    if (char === COLON) {
      return index;
    }
    index += 1;
  }
  return undefined;
}

/** The words between `start` and `end`, split at blanks outside literals and parentheses. */
function parameterWords(text: string, start: number, end: number): ParameterWord[] {
  const words: ParameterWord[] = [];
  let wordStart: number | undefined;
  let depth = 0;
  for (let index = start; index < end; ) {
    const isBreak = depth === 0 && BLANK_RE.test(text[index] ?? "");
    if (isBreak && wordStart !== undefined) {
      words.push({ start: wordStart, end: index });
    }
    wordStart = isBreak ? undefined : (wordStart ?? index);
    const literal = isBreak ? undefined : literalAt(text, index);
    depth += literal === undefined ? depthChange(text[index]) : 0;
    index = literal?.end ?? index + 1;
  }
  return wordStart === undefined ? words : [...words, { start: wordStart, end }];
}

function parameterDefault(text: string, word: ParameterWord): ParameterDefault[] {
  const written = text.slice(word.start, word.end);
  const match = PARAMETER_RE.exec(written);
  const value = match?.[3];
  if (match === null || value === undefined) {
    return [];
  }
  const defaultStart = word.end - value.length;
  const literals = literalsBetween(text, defaultStart, word.end);
  const target = NAME_RE.test(value) ? value : undefined;
  const isExported = (match[1] as string).includes(EXPORT_PREFIX);
  return [{ name: match[2] as string, isExported, literals, target }];
}

/** The recipe headers of a justfile with the defaults of their parameters. */
export function recipeHeaders(text: string): RecipeHeader[] {
  return [...text.matchAll(RECIPE_NAME_RE)].flatMap((match) => {
    const nameEnd = match.index + match[0].length;
    const colon = headerColon(text, nameEnd);
    if (colon === undefined) {
      return [];
    }
    const words = parameterWords(text, nameEnd, colon);
    const defaults = words.flatMap((word) => parameterDefault(text, word));
    return [{ start: match.index, end: colon, defaults }];
  });
}
