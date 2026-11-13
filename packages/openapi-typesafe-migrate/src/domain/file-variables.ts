import { commandRoles, withoutWindowsSuffix } from "./command-roles.js";
import { packageReference } from "./old-package-words.js";
import { GENERATOR_COMMAND } from "./package-names.js";
import type { ShellCommand, ShellWord } from "./shell-words.js";
import type { VariableProgram } from "./variable-programs.js";

/**
 * What the commands of a file know about its variables, and which commands run the generator.
 * The command migration reads them; each file kind (a Makefile, a Dockerfile, a YAML `env`, the
 * assignments of a shell text) answers them from its own definitions (shell-variables.ts).
 */

const RECIPE_PREFIX_RE = /^[@+-]+(?=.)/;

/**
 * The command with the recipe prefix taken off the value of its first word, so `@npx …` runs
 * `npx`. A shell command never starts with an option, so this changes nothing else.
 */
export function withoutRecipePrefix(words: ShellCommand): ShellCommand {
  const [first, ...rest] = words;
  if (first === undefined || !RECIPE_PREFIX_RE.test(first.value)) {
    return words;
  }
  return [{ ...first, value: first.value.replace(RECIPE_PREFIX_RE, "") }, ...rest];
}

/** A program word that expands one variable the file sets: as written, and what it runs. */
export interface VariableProgramUse {
  readonly written: string;
  readonly program: VariableProgram;
}

/** A whole word that expands one variable the file sets: as written, and the value it gets. */
export interface VariableReference {
  readonly written: string;
  readonly value: string;
}

/**
 * The variables of a file as its commands use them. A program word can run the generator through
 * a variable (`$(OAT)` in a Makefile with `OAT := openapi-typescript`): the variable's value is
 * migrated where it is set, the flags after it where it is used. An argument can expand a
 * variable that holds flags (`$(FLAGS)` with `FLAGS := -it`); the variable may serve other
 * commands too, so its old flags are reported, not changed.
 */
export interface FileVariables {
  /** What a program word runs through a variable, or undefined when it expands none. */
  programAt(program: ShellWord): VariableProgramUse | undefined;
  referenceAt(word: ShellWord): VariableReference | undefined;
}

export const NO_VARIABLES: FileVariables = {
  programAt: () => undefined,
  referenceAt: () => undefined,
};

/**
 * Whether a command runs the generator by its old name, so a variable set to it holds the
 * generator command.
 */
export function runsGenerator(command: ShellCommand): boolean {
  const words = withoutRecipePrefix(command);
  const { program } = commandRoles(words);
  const word = program === undefined ? undefined : words[program];
  return (
    word !== undefined &&
    packageReference(withoutWindowsSuffix(word.value)).name === GENERATOR_COMMAND
  );
}
