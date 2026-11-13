import type { DocumentString } from "./config-documents.js";
import type { FileVariables } from "./file-variables.js";

/**
 * The default of an input of an action (`inputs.NAME.default` in `action.yml`) or of a reusable
 * or manual workflow (`on.workflow_call.inputs`): a step that runs `${{ inputs.NAME }}` runs it
 * when the caller gives none, so it is read as shell text, as an `env` value is, and it is the
 * value of `${{ inputs.NAME }}` for the flags that a command gets from it.
 */
const INPUTS_KEY = "inputs";
const DEFAULT_KEY = "default";
const INPUT_DEFAULT_DEPTH = 3;
const INPUT_NAME_INDEX = -2;

export const isInputDefault = (value: DocumentString): boolean =>
  value.path.length >= INPUT_DEFAULT_DEPTH &&
  value.path.at(-1) === DEFAULT_KEY &&
  value.path.at(-INPUT_DEFAULT_DEPTH) === INPUTS_KEY;

/** A whole word that is one input expression, also in double quotes: `"${{ inputs.flags }}"`. */
const INPUT_EXPRESSION_RE = /^"?\$\{\{[ \t]*inputs\.([A-Za-z_][A-Za-z0-9_-]*)[ \t]*\}\}"?$/;

/**
 * The variables with the input defaults of a file as values of `${{ inputs.NAME }}`: an argument
 * that expands one gets its old flags reported, as `$FLAGS` does for an `env` value. The defaults
 * of one name (an action and a workflow in one file) are read as one.
 */
export function withInputDefaults(
  variables: FileVariables,
  strings: readonly DocumentString[],
): FileVariables {
  const values = new Map<string, string>();
  for (const value of strings.filter(isInputDefault)) {
    const name = String(value.path.at(INPUT_NAME_INDEX));
    values.set(
      name,
      [values.get(name), value.value].filter((part) => part !== undefined).join(" "),
    );
  }
  return {
    programAt: (program) => variables.programAt(program),
    referenceAt: (word) => {
      const name = INPUT_EXPRESSION_RE.exec(word.raw)?.[1];
      const value = name === undefined ? undefined : values.get(name);
      return (
        variables.referenceAt(word) ??
        (value === undefined ? undefined : { written: word.raw, value })
      );
    },
  };
}
