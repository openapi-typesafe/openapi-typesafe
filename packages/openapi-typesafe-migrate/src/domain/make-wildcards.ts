/**
 * The wildcards of a Makefile's `include` (`include mk/*.mk`). Make expands a word with `*`, `?`
 * or `[…]` with `glob` (glob.c, without `GLOB_PERIOD`): each wildcard matches within one folder
 * name, never a `/`, and not the `.` that starts a hidden name; a `\` makes the next character
 * plain. The paths come sorted, and a word that matches no file stays the word itself, a file
 * make then cannot find. The tool matches against the project's file list and sorts by
 * character, the order of the C locale (make 3.81 and 4.3 or newer sort by the locale make runs
 * in, which may differ for the case of letters).
 */

const SEPARATOR = "/";
const ESCAPE = "\\";
const ANY_NAME = "*";
const ANY_CHARACTER = "?";
const CLASS_START = "[";
const CLASS_END = "]";
const CLASS_NEGATIONS: ReadonlySet<string> = new Set(["!", "^"]);
const RANGE = "-";
/** An unescaped wildcard character. */
const WILDCARD_RE = /(?:^|[^\\])(?:\\\\)*[*?[]/;
const REGEXP_SPECIAL_RE = /[.*+?^${}()|[\]\\/]/g;
const NO_HIDDEN_NAME = "(?!\\.)";
const NOT_SEPARATOR_RUN = "[^/]*";
const NOT_SEPARATOR = "[^/]";

/** Whether a word holds a wildcard that make expands. */
export const hasWildcard = (word: string): boolean => WILDCARD_RE.test(word);

const literal = (char: string): string => char.replace(REGEXP_SPECIAL_RE, "\\$&");

/** A bracket class from `[` at `start`, as a pattern and the index after it, or undefined. */
function bracketClass(
  pattern: string,
  start: number,
): { source: string; next: number } | undefined {
  let index = start + 1;
  const isNegated = CLASS_NEGATIONS.has(pattern[index] ?? "");
  index += isNegated ? 1 : 0;
  // A `]` right after the `[` (or its negation) is a member, not the end.
  const members: string[] = [pattern[index] === CLASS_END ? `\\${CLASS_END}` : ""];
  index += pattern[index] === CLASS_END ? 1 : 0;
  for (; index < pattern.length && pattern[index] !== CLASS_END; index++) {
    const char = pattern[index] as string;
    if (char === SEPARATOR) {
      return undefined;
    }
    members.push(char === RANGE ? RANGE : literal(char));
  }
  if (index >= pattern.length) {
    return undefined;
  }
  const source = `[${isNegated ? "^/" : ""}${members.join("")}]`;
  return { source, next: index + 1 };
}

/** The pattern of one character of a wildcard word at `index`, and the index after it. */
function piece(pattern: string, index: number): { source: string; next: number } {
  const char = pattern[index] as string;
  const isNameStart = index === 0 || pattern[index - 1] === SEPARATOR;
  const hidden = isNameStart ? NO_HIDDEN_NAME : "";
  if (char === ESCAPE && index + 1 < pattern.length) {
    return { source: literal(pattern[index + 1] as string), next: index + 2 };
  }
  if (char === ANY_NAME) {
    return { source: `${hidden}${NOT_SEPARATOR_RUN}`, next: index + 1 };
  }
  if (char === ANY_CHARACTER) {
    return { source: `${hidden}${NOT_SEPARATOR}`, next: index + 1 };
  }
  const found = char === CLASS_START ? bracketClass(pattern, index) : undefined;
  return found === undefined
    ? { source: literal(char), next: index + 1 }
    : { source: `${hidden}${found.source}`, next: found.next };
}

/** The regular expression of a wildcard word, which matches whole project paths. */
function wildcardPattern(pattern: string): RegExp {
  const parts: string[] = [];
  for (let index = 0; index < pattern.length; ) {
    const { source, next } = piece(pattern, index);
    parts.push(source);
    index = next;
  }
  return new RegExp(`^${parts.join("")}$`);
}

/** The listed paths that a wildcard project path matches, sorted, or the word when none does. */
export function wildcardPaths(pattern: string, listed: readonly string[]): string[] {
  const matches = wildcardPattern(pattern);
  const found = listed.filter((path) => matches.test(path));
  return found.length === 0 ? [pattern] : found.sort();
}
