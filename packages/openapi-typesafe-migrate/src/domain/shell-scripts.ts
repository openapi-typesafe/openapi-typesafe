/**
 * The shells that run a command line given with `-c`, and where that command line is in the
 * words of a command, as the exec forms of Dockerfiles and YAML files and shell text start them.
 */

/** Shells whose `-c` option takes a command line and that run a script given as input. */
export const SHELLS: ReadonlySet<string> = new Set(["sh", "bash", "dash", "ash", "zsh", "ksh"]);
const OPTION_PREFIXES: readonly string[] = ["-", "+"];
const SHORT_OPTION_PREFIX = "-";
const LONG_OPTION_PREFIX = "--";
const END_OF_OPTIONS = "--";
const COMMAND_OPTION = "c";
/** `-o pipefail` and `+o posix` name a shell option in the next word. */
const SET_OPTIONS: ReadonlySet<string> = new Set(["-o", "+o"]);
const PATH_SEPARATOR = "/";

const isShellOption = (word: string): boolean =>
  OPTION_PREFIXES.some((prefix) => word.startsWith(prefix));

/**
 * The command line of `["sh", "-c", "…"]` (also `/bin/bash -o pipefail -ec`, `bash -c -- "…"`): as
 * the shell reads it, the first word that is not an option, after `--` that ends the options,
 * when a short option holds `c`.
 */
export function shellScript<Word extends { readonly value: string }>(
  words: readonly Word[],
): Word | undefined {
  const program = words[0]?.value.split(PATH_SEPARATOR).at(-1) ?? "";
  if (!SHELLS.has(program)) {
    return undefined;
  }
  let hasCommandOption = false;
  let index = 1;
  for (let word = words[index]?.value; word !== undefined; word = words[index]?.value) {
    if (word === END_OF_OPTIONS || !isShellOption(word)) {
      const script = word === END_OF_OPTIONS ? words[index + 1] : words[index];
      return hasCommandOption ? script : undefined;
    }
    const isShort = word.startsWith(SHORT_OPTION_PREFIX) && !word.startsWith(LONG_OPTION_PREFIX);
    hasCommandOption ||= isShort && word.includes(COMMAND_OPTION);
    index += SET_OPTIONS.has(word) ? 2 : 1;
  }
  return undefined;
}
