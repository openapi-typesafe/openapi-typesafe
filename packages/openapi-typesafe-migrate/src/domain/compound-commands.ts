import type { ShellWord } from "./shell-word-parts.js";

/** The reserved words of the shell around a simple command (shell-words.ts reads commands). */

/**
 * Reserved words (POSIX 2.4, and bash's `[[`) that open or close a compound command and are
 * followed by a command: `if a; then b; fi`, `while a; do b; done`, `! a`, `{ a; }`. They are
 * reserved only where a command name can stand, and only unquoted, so `echo then` and `"if"` stay
 * words. `time` is a launcher (domain/command-launchers.ts), as it takes options.
 */
const COMMAND_PREFIX_WORDS: ReadonlySet<string> = new Set([
  "if",
  "then",
  "elif",
  "else",
  "fi",
  "while",
  "until",
  "do",
  "done",
  "!",
  "{",
  "}",
  "esac",
]);
/**
 * Reserved words whose words up to the next separator are not a command: `for NAME in WORDS`,
 * `select NAME in WORDS`, `case WORD in`, and a `[[ … ]]` test.
 */
const CLAUSE_WORDS: ReadonlySet<string> = new Set(["for", "select", "case", "[["]);
/** `function NAME` (bash, ksh): the function's body, a compound command, follows the name. */
const FUNCTION_WORD = "function";
const FUNCTION_HEADER_LENGTH = 2;

const isReserved = (word: ShellWord | undefined, words: ReadonlySet<string>): boolean =>
  word !== undefined && word.raw === word.value && words.has(word.value);

/** How many words at `index` are a reserved word or a function header, before a command. */
function prefixLength(words: readonly ShellWord[], index: number): number {
  if (isReserved(words[index], COMMAND_PREFIX_WORDS)) {
    return 1;
  }
  const word = words[index];
  return word?.raw === FUNCTION_WORD ? FUNCTION_HEADER_LENGTH : 0;
}

/**
 * The simple command that a list of words between two separators holds, without the reserved
 * words in front of it: `then a b` is the command `a b`, and `for x in a b` is none.
 */
export function simpleCommand(words: readonly ShellWord[]): ShellWord[] {
  let first = 0;
  for (let length = prefixLength(words, 0); length > 0; length = prefixLength(words, first)) {
    first += length;
  }
  return isReserved(words[first], CLAUSE_WORDS) ? [] : words.slice(first);
}
