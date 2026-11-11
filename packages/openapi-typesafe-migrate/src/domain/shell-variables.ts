import { type FileVariables, runsGenerator, type VariableProgramUse } from "./file-variables.js";
import { type WordExpansion, wholeWordExpansion, wordExpansions } from "./parameter-expansions.js";
import { isArrayAssignment, shellAssignments } from "./shell-assignments.js";
import { type ShellCommand, type ShellWord, shellCommands } from "./shell-words.js";
import {
  type ProgramDefinition,
  type VariableProgram,
  variablePrograms,
} from "./variable-programs.js";

/** A shell variable as a file sets it: its name and its value, read as shell text. */
export interface VariableDefinition {
  readonly name: string;
  readonly value: string;
}

/** A whole word that expands one shell variable: `$NAME`, `${NAME}`, also in double quotes. */
const SHELL_VARIABLE_RE = /^"?\$(?:([A-Za-z_][A-Za-z0-9_]*)|\{([A-Za-z_][A-Za-z0-9_]*)\})"?$/;

/** The variable that `text` expands as a whole, or undefined. */
function expandedName(text: string): string | undefined {
  const match = SHELL_VARIABLE_RE.exec(text);
  return match === null ? undefined : (match[1] ?? match[2]);
}

/** Whether text, read as a command line, runs the generator. */
const textRunsGenerator = (text: string): boolean => shellCommands(text).some(runsGenerator);

/** What a text sets a variable to: a reference to one variable, or a command. */
function textDefinition(name: string, text: string): ProgramDefinition {
  const target = expandedName(text.trim());
  return target === undefined
    ? { name, kind: "command", runsGenerator: textRunsGenerator(text) }
    : { name, kind: "reference", target };
}

/**
 * What a value that is one expansion with a word (`GEN="${GEN:-npx openapi-typescript}"`) can
 * set: the word, or the variable's own value. The variable's value before the assignment, and
 * the value of an alternative's unset variable, come from outside the text: another program.
 */
function expansionDefinitions(name: string, expansion: WordExpansion): ProgramDefinition[] {
  const word = textDefinition(name, expansion.text);
  const isOutside = expansion.use === "alternative" || expansion.name === name;
  const variable: ProgramDefinition = isOutside
    ? { name, kind: "command", runsGenerator: false }
    : { name, kind: "reference", target: expansion.name };
  return [word, variable];
}

/** A definition as the programs it can set: references to variables, or commands. */
function programDefinitions({ name, value }: VariableDefinition): ProgramDefinition[] {
  const expansion = wholeWordExpansion(value.trim());
  return expansion === undefined
    ? [textDefinition(name, value)]
    : expansionDefinitions(name, expansion);
}

/**
 * The variables that a file's shell commands expand: `$GEN` runs the generator when every
 * definition of `GEN` in the file sets it to the generator (see variable-programs.ts). The
 * values of one name are read as one (a workflow, a job and a step `env`), since any of them can
 * reach a command.
 */
export function shellVariables(definitions: readonly VariableDefinition[]): FileVariables {
  const values = new Map<string, string>();
  for (const { name, value } of definitions) {
    values.set(name, [values.get(name), value].filter((part) => part !== undefined).join(" "));
  }
  const programs = variablePrograms(definitions.flatMap(programDefinitions));
  // A word that expands no variable has no name, so no definition (not even of "") matches it.
  const nameAt = (word: ShellWord): string | undefined => expandedName(word.raw);
  return {
    programAt: (program) => {
      const name = nameAt(program);
      const found = name === undefined ? undefined : programs.get(name);
      return found === undefined ? undefined : { written: program.raw, program: found };
    },
    referenceAt: (word) => {
      const name = nameAt(word);
      const value = name === undefined ? undefined : values.get(name);
      return value === undefined ? undefined : { written: word.raw, value };
    },
  };
}

/** What two answers for one program word say together: one program, or not only the generator. */
function combinedUse(
  left: VariableProgramUse | undefined,
  right: VariableProgramUse | undefined,
): VariableProgramUse | undefined {
  if (left === undefined || right === undefined) {
    return left ?? right;
  }
  return left.program === right.program ? left : { ...left, program: "generator-or-other" };
}

/**
 * The variables that `${NAME:=word}` and `${NAME=word}` set: the word when the variable is unset,
 * else the value it had, which comes from outside the text.
 */
function assignedByExpansions(commands: readonly ShellCommand[]): VariableDefinition[] {
  return commands
    .flat()
    .flatMap((word) => wordExpansions(word.raw))
    .filter((expansion) => expansion.use === "assign")
    .flatMap(({ name, text }) => [
      { name, value: text },
      { name, value: "" },
    ]);
}

/**
 * The variables of a file (a workflow `env`, a Makefile) and those that its shell commands set
 * themselves (`GEN="npx openapi-typescript"; $GEN a.yaml -it`), read as one: a name both set
 * runs the generator only when both say so, as for the definitions of one file.
 */
export function withShellAssignments(
  commands: readonly ShellCommand[],
  file: FileVariables,
): FileVariables {
  const assigned = commands.flatMap(shellAssignments).filter((found) => !isArrayAssignment(found));
  const definitions = [...assigned, ...assignedByExpansions(commands)];
  if (definitions.length === 0) {
    return file;
  }
  const own = shellVariables(definitions);
  return {
    programAt: (program) => combinedUse(own.programAt(program), file.programAt(program)),
    referenceAt: (word) => own.referenceAt(word) ?? file.referenceAt(word),
  };
}

/** Two programs as one: the same, or not only the generator when they differ. */
const joinedProgram = (left: VariableProgram, right: VariableProgram): VariableProgram =>
  left === right ? left : "generator-or-other";

/**
 * What a program word that is one expansion with a word runs (`npx ${GEN:-openapi-typescript}`,
 * `"${GEN:-npx openapi-typescript}" a.yaml`): its word, or the variable's value, which the
 * variables of the text know or which comes from outside it.
 */
function expansionUse(word: ShellWord, variables: FileVariables): VariableProgramUse | undefined {
  const expansion = wholeWordExpansion(word.raw);
  if (expansion === undefined) {
    return undefined;
  }
  const programOf = (name: string | undefined): VariableProgram =>
    (name === undefined ? undefined : variables.programAt({ ...word, raw: `$${name}` })?.program) ??
    "other";
  const target = expandedName(expansion.text.trim());
  const textProgram = textRunsGenerator(expansion.text) ? "generator" : "other";
  const own = target === undefined ? textProgram : programOf(target);
  const variable = programOf(expansion.use === "alternative" ? undefined : expansion.name);
  return { written: word.raw, program: joinedProgram(own, variable) };
}

/** The variables with the program words that are expansions with a word. */
export function withWordExpansions(variables: FileVariables): FileVariables {
  return {
    programAt: (program) => variables.programAt(program) ?? expansionUse(program, variables),
    referenceAt: (word) => variables.referenceAt(word),
  };
}

/**
 * A program word that expands one shell variable as a whole: `$GEN`, `${GEN}`, a bash array
 * `"${GEN[@]}"`, and in a Makefile recipe `$$GEN`.
 */
const VARIABLE_NAME = "[A-Za-z_][A-Za-z0-9_]*";
const VARIABLE_WORD_RE = new RegExp(
  `^"?\\$\\$?(?:${VARIABLE_NAME}|\\{${VARIABLE_NAME}(?:\\[[^\\]]*\\])?\\})"?$`,
);

/**
 * The variables with the program words that expand a variable no definition the tool reads sets:
 * one set by another `script` item, through `$GITHUB_ENV`, by a recipe line, as an array or
 * outside the file. It may run the generator, so the old flags after it are reported, not kept
 * without a word.
 */
export function withUnreadVariables(variables: FileVariables): FileVariables {
  return {
    programAt: (program) =>
      variables.programAt(program) ??
      (VARIABLE_WORD_RE.test(program.raw)
        ? { written: program.raw, program: "generator-or-other" }
        : undefined),
    referenceAt: (word) => variables.referenceAt(word),
  };
}
