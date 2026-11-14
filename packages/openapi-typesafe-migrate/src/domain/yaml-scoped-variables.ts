import type { DocumentString } from "./config-documents.js";
import type { FileVariables } from "./file-variables.js";
import { withInputDefaults } from "./input-defaults.js";
import { shellVariables } from "./shell-variables.js";
import { type EnvironmentEntry, isInScope } from "./yaml-environment-entries.js";
import { type VariableReferences, withVariableReferences } from "./yaml-environments.js";
import { shellText } from "./yaml-shell-text.js";

/**
 * The variables of a YAML file as its commands use them (yaml-environment-entries.ts): `$GEN`
 * runs the generator when a map sets `GEN` to it. The maps that reach a command are read as one,
 * by name: those of the file and of a job a map names, and those of the list items (steps,
 * jobs, stages) that the command is in.
 */

/** What the variables of a file are read from. */
export interface VariableSources {
  readonly text: string;
  readonly entries: ReadonlyMap<DocumentString, EnvironmentEntry>;
  /** The values of the file's parameters by name (input-defaults.ts). */
  readonly inputs: ReadonlyMap<string, string>;
  readonly references: VariableReferences;
}

/** A variable map's value, with where it is set. */
interface ScopedDefinition {
  readonly entry: EnvironmentEntry;
  readonly name: string;
  readonly value: string;
}

/** The variables that reach each value of a file. */
export function scopedVariables({
  text,
  entries,
  inputs,
  references,
}: VariableSources): (value: DocumentString) => FileVariables {
  const definitions = [...entries].map(([value, entry]): ScopedDefinition => {
    const shell = value.isEscaped
      ? withVariableReferences(value.value, references)
      : shellText(text, value, references);
    return { entry, name: entry.name, value: shell.slice(entry.head) };
  });
  return (value) => {
    const reaching = definitions.filter(({ entry }) => isInScope(value.path, entry));
    return withInputDefaults(shellVariables(reaching), inputs);
  };
}
