/**
 * Which program a variable runs where a command starts with it (`$GEN …`, `$(GEN) …`). A file can
 * set one name in several places: two Dockerfile stages, a workflow and one of its steps, a
 * Makefile line and a later one that make reads before it runs any recipe. The tool does not
 * follow which definition reaches which command, so it changes the flags after a variable only
 * when every definition of the name runs the generator.
 */

import { assertNever } from "./assert-never.js";

/**
 * `generator`: every definition runs the generator. `generator-or-other`: some definitions run it
 * and some run another program, so the flags after the variable are left to the user. `other`: no
 * definition runs it.
 */
export type VariableProgram = "generator" | "generator-or-other" | "other";

/**
 * What one definition of a variable sets it to: a command (that runs the generator or not), a
 * reference to one variable (`GEN := $(OAT)`, `ENV GEN=$GEN`), no program of its own (an empty
 * value, or text appended to the value the variable has, `GEN += --flag`, which keeps its
 * program), or a value that only the run decides (a workflow expression, a make `?=` that the
 * environment can override, a value make computes), which can be the generator or another program.
 */
export type ProgramDefinition =
  | { readonly name: string; readonly kind: "command"; readonly runsGenerator: boolean }
  | { readonly name: string; readonly kind: "reference"; readonly target: string }
  | { readonly name: string; readonly kind: "no-program" }
  | { readonly name: string; readonly kind: "run-time" };

/**
 * Where text appended to a variable's value (make `+=`, bash `+=`) is: at the start of the value,
 * when every earlier definition in the file is empty (`CMD =`, then `CMD += npx …`), so its own
 * program is the variable's; after a value the file sets, whose program it keeps; or after a
 * value from outside the file (the environment, an included file), when no earlier definition
 * sets the name.
 */
export type AppendedPlace = "start" | "after-value" | "after-outside";

/** Where appended text is, from the values that earlier definitions of its name set. */
export function appendedPlace(earlierValues: readonly string[]): AppendedPlace {
  if (earlierValues.length === 0) {
    return "after-outside";
  }
  return earlierValues.every((value) => value.trim() === "") ? "start" : "after-value";
}

/** Whether a definition can run the generator, given the names found to run it so far. */
function canRunGenerator(definition: ProgramDefinition, generators: ReadonlySet<string>): boolean {
  switch (definition.kind) {
    case "command":
      return definition.runsGenerator;
    case "reference":
      return generators.has(definition.target);
    case "no-program":
      return false;
    case "run-time":
      return true;
    default:
      return assertNever(definition);
  }
}

/**
 * Whether a definition can run another program. A reference to a variable the file never sets
 * gets its value from elsewhere (the environment, a base image), so it can run anything.
 */
function canRunOther(
  definition: ProgramDefinition,
  others: ReadonlySet<string>,
  defined: ReadonlySet<string>,
): boolean {
  switch (definition.kind) {
    case "command":
      return !definition.runsGenerator;
    case "reference":
      return others.has(definition.target) || !defined.has(definition.target);
    case "no-program":
      return false;
    case "run-time":
      return true;
    default:
      return assertNever(definition);
  }
}

/**
 * The program each defined variable runs. References are followed however long the chain, so
 * `GEN := $(OAT)` runs what `OAT` runs; a cycle adds nothing.
 */
export function variablePrograms(
  definitions: readonly ProgramDefinition[],
): ReadonlyMap<string, VariableProgram> {
  const defined = new Set(definitions.map((definition) => definition.name));
  const generators = new Set<string>();
  const others = new Set<string>();
  for (let size = -1; size !== generators.size + others.size; ) {
    size = generators.size + others.size;
    for (const definition of definitions) {
      if (canRunGenerator(definition, generators)) {
        generators.add(definition.name);
      }
      if (canRunOther(definition, others, defined)) {
        others.add(definition.name);
      }
    }
  }
  const programOf = (name: string): VariableProgram => {
    if (!generators.has(name)) {
      return "other";
    }
    return others.has(name) ? "generator-or-other" : "generator";
  };
  return new Map([...defined].map((name) => [name, programOf(name)]));
}
