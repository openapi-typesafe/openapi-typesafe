import { PARAMETER_OPEN, parameterExpansionEnd } from "./shell-word-parts.js";

/**
 * The parameter expansions of a word that give a word of their own when the variable is unset or
 * empty (POSIX 2.6.2): `${GEN:-npx openapi-typescript}`, `${GEN:=…}`, and when it is set:
 * `${GEN:+…}`. That word is command text as written, the common "overridable command" idiom, so
 * it is read as a command line where it is written. The value is the variable's or that word,
 * which only the shell knows.
 */

/** How an expansion uses its word: instead of an unset variable, as its value too, or if set. */
export type ExpansionUse = "default" | "assign" | "alternative";

/** An expansion with a word: the variable, how it uses the word, the word and where it is. */
export interface WordExpansion {
  readonly name: string;
  readonly use: ExpansionUse;
  /** The word as written, between the operator and the closing brace. */
  readonly text: string;
  /** The offset of `text` in the text that was scanned. */
  readonly start: number;
  /** The offsets of the whole expansion, `${` to `}`. */
  readonly expansionStart: number;
  readonly expansionEnd: number;
}

/** `${NAME`, then an operator with a word: `-`, `=`, `+`, each also with `:` before it. */
const EXPANSION_HEAD_RE = /^\$\{([A-Za-z_][A-Za-z0-9_]*):?([-=+])/;
const USES: Readonly<Record<string, ExpansionUse>> = {
  "-": "default",
  "=": "assign",
  "+": "alternative",
};
const SINGLE_QUOTE = "'";
const BACKSLASH = "\\";

/** The expansion with a word at `start` of `text`, or undefined for any other expansion. */
function expansionAt(text: string, start: number): WordExpansion | undefined {
  const head = EXPANSION_HEAD_RE.exec(text.slice(start));
  const end = head === null ? undefined : parameterExpansionEnd(text, start);
  if (head === null || end === undefined) {
    return undefined;
  }
  const wordStart = start + head[0].length;
  return {
    name: head[1] as string,
    use: USES[head[2] as string] as ExpansionUse,
    text: text.slice(wordStart, end - 1),
    start: wordStart,
    expansionStart: start,
    expansionEnd: end,
  };
}

/**
 * The expansions with a word in a word as written, outside single quotes (where `$` is a
 * character), in double quotes too. Nested ones are found when their word is read as commands.
 */
export function wordExpansions(raw: string): WordExpansion[] {
  const found: WordExpansion[] = [];
  for (let index = 0; index < raw.length; ) {
    const char = raw[index];
    if (char === SINGLE_QUOTE) {
      const close = raw.indexOf(SINGLE_QUOTE, index + 1);
      index = close === -1 ? raw.length : close + 1;
    } else if (char === BACKSLASH) {
      index += 2;
    } else if (raw.startsWith(PARAMETER_OPEN, index)) {
      const expansion = expansionAt(raw, index);
      found.push(...(expansion === undefined ? [] : [expansion]));
      index = expansion?.expansionEnd ?? index + PARAMETER_OPEN.length;
    } else {
      index += 1;
    }
  }
  return found;
}

const DOUBLE_QUOTE = '"';

/** The expansion that is a whole word, also in double quotes: `${GEN:-…}`, `"${GEN:-…}"`. */
export function wholeWordExpansion(raw: string): WordExpansion | undefined {
  const isQuoted = raw.length > 1 && raw.startsWith(DOUBLE_QUOTE) && raw.endsWith(DOUBLE_QUOTE);
  const inner = isQuoted ? 1 : 0;
  const [expansion] = wordExpansions(raw);
  const isWhole =
    expansion?.expansionStart === inner && expansion.expansionEnd === raw.length - inner;
  return isWhole ? expansion : undefined;
}
