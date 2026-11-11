import { type FileVariables, runsGenerator } from "./file-variables.js";
import { type ShellWord, shellCommands } from "./shell-words.js";
import { type ProgramDefinition, variablePrograms } from "./variable-programs.js";

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

/** A definition as the program it sets: a reference to one variable, or a command. */
function programDefinition({ name, value }: VariableDefinition): ProgramDefinition {
  const target = expandedName(value.trim());
  if (target !== undefined) {
    return { name, kind: "reference", target };
  }
  return { name, kind: "command", runsGenerator: shellCommands(value).some(runsGenerator) };
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
  const programs = variablePrograms(definitions.map(programDefinition));
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
