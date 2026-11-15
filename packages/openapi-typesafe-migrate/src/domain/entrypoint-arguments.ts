import { type Finding, type Locate, programArgumentFindings } from "./argument-findings.js";
import { commandWordFindings } from "./command-migration.js";
import { commandRoles } from "./command-roles.js";
import { NO_VARIABLES, runsGenerator } from "./file-variables.js";
import { shellScript } from "./shell-scripts.js";
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

/**
 * The words of a script that run its arguments as a command: `"$@"`, also after `exec`, with or
 * without braces and quotes. Compose and Kubernetes give `$$` to the container as one `$`, so
 * `"$$@"` is the same word there.
 */
const ARGUMENTS_WORDS: ReadonlySet<string> = new Set(
  ["$", "$$"].flatMap((dollar) =>
    ["@", "{@}"].flatMap((name) => ["", '"'].map((quote) => `${quote}${dollar}${name}${quote}`)),
  ),
);

/** Whether a shell script runs its arguments as a command (`exec "$@"`). */
function runsArguments(script: string): boolean {
  return shellCommands(script).some((words) => {
    const { program } = commandRoles(words);
    return program !== undefined && ARGUMENTS_WORDS.has(words[program]?.raw ?? "");
  });
}

/**
 * Whether an entrypoint runs the command it gets as a command: any program but a shell script
 * that does not run its arguments (`["sh", "-c", "grep -it x \"$@\"", "--"]`), which may give
 * them to another program.
 */
function runsItsCommand(entrypoint: ShellCommand): boolean {
  const script = shellScript(entrypoint);
  return script === undefined || runsArguments(script.value);
}

/**
 * The commands that a container runs from its exec-form entrypoint and command. A command that
 * runs the generator itself is read as its own command, as Docker reads each exec form of a
 * Dockerfile, after an entrypoint that runs it (`["tini", "--"]`, `["docker-entrypoint.sh"]`,
 * `["sh", "-c", "exec \"$@\"", "--"]`). Any other command is the arguments of the entrypoint,
 * so the items of both, the entrypoint first, are one command: a launcher or an init program
 * (`["npx"]`, `["tini", "--", "npx"]`) runs the generator the command names, a generator
 * entrypoint gets the command's flags, and an old name after a script that may give it to
 * another program is reported.
 */
export function containerCommand<Word extends ShellWord>(
  entrypoint: readonly Word[],
  command: readonly Word[],
): (readonly Word[])[] {
  return runsGenerator(command) && runsItsCommand(entrypoint)
    ? [entrypoint, command]
    : [[...entrypoint, ...command]];
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
