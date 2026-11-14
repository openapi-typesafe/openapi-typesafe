/**
 * A command in exec form (a Dockerfile JSON array, a Compose or Kubernetes YAML list) is a list
 * of words that no shell splits. When the list starts a shell with `-c`, one of its words is a
 * command line that the shell does read: the Dockerfile and the YAML migrations read it as such.
 */

/** Shells whose `-c` option takes a command line. */
const SHELLS: ReadonlySet<string> = new Set(["sh", "bash", "dash", "ash", "zsh"]);
const OPTION_PREFIX = "-";
const LONG_OPTION_PREFIX = "--";
const COMMAND_OPTION = "c";
const SET_OPTION = "-o";
const PATH_SEPARATOR = "/";

/**
 * The word of `["sh", "-c", "…"]` (also `/bin/bash -o pipefail -ec`) that holds the command line:
 * the word after the first short option that holds `c`, before any word that is not an option.
 */
export function shellScript<Word extends { readonly value: string }>(
  words: readonly Word[],
): Word | undefined {
  const program = words[0]?.value.split(PATH_SEPARATOR).at(-1) ?? "";
  if (!SHELLS.has(program)) {
    return undefined;
  }
  let index = 1;
  for (let option = words[index]?.value; option !== undefined; option = words[index]?.value) {
    if (!option.startsWith(OPTION_PREFIX)) {
      return undefined;
    }
    if (!option.startsWith(LONG_OPTION_PREFIX) && option.includes(COMMAND_OPTION)) {
      return words[index + 1];
    }
    // `-o pipefail` names a shell option in the next word.
    index += option === SET_OPTION ? 2 : 1;
  }
  return undefined;
}
