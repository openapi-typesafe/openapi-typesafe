import { type Finding, type Locate, programArgumentFindings } from "./argument-findings.js";
import { commandWordFindings } from "./command-migration.js";
import { NO_VARIABLES, runsGenerator } from "./file-variables.js";
import type { ShellCommand, ShellWord } from "./shell-words.js";
import { shellCommands } from "./shell-words.js";
import type { VariableProgram } from "./variable-programs.js";

/**
 * A container runs its entrypoint with the command as its arguments: Docker appends the items of
 * an exec-form `CMD` to an exec-form `ENTRYPOINT`, Compose (and GitLab and CircleCI images) the
 * `command` to the `entrypoint`, Kubernetes the `args` to the `command`. When the entrypoint runs
 * the generator, the old flags of the command are its flags, written in another place. The
 * Dockerfile and the YAML migrations pair them by their own rules and read them here.
 */

/** Shells whose `-c` option takes a command line, as `SHELL` and the shell form use them. */
const SHELLS: ReadonlySet<string> = new Set(["sh", "bash", "dash", "ash", "zsh"]);
const OPTION_PREFIX = "-";
const LONG_OPTION_PREFIX = "--";
const COMMAND_OPTION = "c";
const SET_OPTION = "-o";
const PATH_SEPARATOR = "/";

/**
 * The command line of `["sh", "-c", "…"]` (also `/bin/bash -o pipefail -ec`): the word after the
 * first short option that holds `c`, before any word that is not an option.
 */
export function shellScript(words: readonly ShellWord[]): ShellWord | undefined {
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

/**
 * What an entrypoint gives its arguments to: the generator when it runs the generator under the
 * name the migration gives it (a pinned or unknown path keeps its arguments, as a command does);
 * a shell script that runs the generator gets them as `$1`… and may pass them on, so either.
 */
export function entrypointProgram(entrypoint: ShellCommand): VariableProgram {
  const script = shellScript(entrypoint);
  if (script !== undefined) {
    return shellCommands(script.value).some(runsGenerator) ? "generator-or-other" : "other";
  }
  const { changes } = commandWordFindings([entrypoint], () => "");
  return changes.some((change) => change.kind === "command-renamed") ? "generator" : "other";
}

/**
 * An entrypoint, the command that is its arguments, and how the report names the entrypoint.
 * `isPlaced` is false when the command's words are not where the text writes them (a YAML value
 * with an escape): their old flags are then reported, never edited at a wrong place.
 */
export interface EntrypointCommand {
  readonly entrypoint: ShellCommand;
  readonly command: ShellCommand;
  readonly written: string;
  readonly isPlaced?: boolean;
}

/**
 * The findings of the old flags in a command that an entrypoint gets as arguments: renamed after
 * the generator, one step after a script that may pass them on, none after another program. A
 * command that runs the generator itself is read as its own command, so it is left here.
 */
export function entrypointArgumentFindings(
  { entrypoint, command, written, isPlaced = true }: EntrypointCommand,
  locate: Locate,
): Finding[] {
  const program = entrypointProgram(entrypoint);
  const first = command[0];
  if (program === "other" || first === undefined || entrypointProgram(command) !== "other") {
    return [];
  }
  const use = { written, program: isPlaced ? program : "generator-or-other" };
  return programArgumentFindings(command, { offset: first.start, use }, locate, NO_VARIABLES);
}
