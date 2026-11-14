import type { DocumentString } from "./config-documents.js";
import type { FileVariables, VariableReference } from "./file-variables.js";
import { expressionLiterals, isWholeExpression, mapExpressions } from "./workflow-expressions.js";

/**
 * The default of a parameter (yaml-parameters.ts: an input of a GitHub action or workflow, a
 * GitLab input, a CircleCI or Azure parameter) is the value of `${{ inputs.NAME }}` when the
 * caller gives none, so a command gets the flags in it from there.
 */
const BLANK = " ";
const SURROUNDING_QUOTES_RE = /^"(.*)"$/s;

/**
 * A reference to an input in an expression: `inputs.NAME`, `github.event.inputs.NAME`, or the
 * same with the name as a key, `inputs['NAME']`.
 */
const INPUT_REFERENCE_RE =
  /(?<![\w.-])(?:github\.event\.)?inputs(?:\.([A-Za-z_][A-Za-z0-9_-]*)|\[[ \t]*'([^']*)'[ \t]*\])/g;

/** The values of the inputs of a file, by name; the defaults of one name are read as one. */
export function inputValues(
  defaults: ReadonlyMap<DocumentString, string>,
): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const [value, name] of defaults) {
    values.set(
      name,
      [values.get(name), value.value].filter((part) => part !== undefined).join(BLANK),
    );
  }
  return values;
}

/**
 * What one expression can give, as text: the default of each input it reads and each string
 * literal it holds (`${{ inputs.flags || '-it' }}` gives `-it` either way).
 */
function expressionValue(expression: string, defaults: ReadonlyMap<string, string>): string {
  const inputs = [...expression.matchAll(INPUT_REFERENCE_RE)].flatMap((match) => {
    const value = defaults.get(match[1] ?? match[2] ?? "");
    return value === undefined ? [] : [value];
  });
  const literals = expressionLiterals(expression).map((literal) => literal.text);
  return [...inputs, ...literals].join(BLANK);
}

/**
 * The variables with the values of workflow expressions: an argument that is one expression gets
 * the defaults of the inputs it reads and its string literals as its value, and the value of a
 * variable (`FL: ${{ inputs.flags }}` used as `$FL`) has its expressions read so too, so their old
 * flags are reported, as `$FLAGS` does for an `env` value.
 */
export function withInputDefaults(
  variables: FileVariables,
  defaults: ReadonlyMap<string, string>,
): FileVariables {
  const expressionsRead = (text: string): string =>
    mapExpressions(text, (expression) => expressionValue(expression, defaults));
  return {
    programAt: (program) => variables.programAt(program),
    referenceAt: (word): VariableReference | undefined => {
      const reference = variables.referenceAt(word);
      if (reference !== undefined) {
        return { ...reference, value: expressionsRead(reference.value) };
      }
      // The quotes around a whole expression (`"${{ inputs.flags }}"`) keep its value one word.
      const unquoted = word.raw.replace(SURROUNDING_QUOTES_RE, "$1");
      const value = isWholeExpression(word.raw) ? expressionsRead(unquoted) : "";
      return value.trim() === "" ? undefined : { written: word.raw, value };
    },
  };
}
