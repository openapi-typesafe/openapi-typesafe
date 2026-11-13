import type { DocumentString } from "./config-documents.js";
import type { FileVariables, VariableReference } from "./file-variables.js";
import {
  EXPRESSION_OPEN,
  expressionEnd,
  expressionLiterals,
  isWholeExpression,
} from "./workflow-expressions.js";

/**
 * The default of an input of an action (`inputs.NAME.default` in `action.yml`) or of a reusable
 * or manual workflow (`on.workflow_call.inputs`): a step that runs `${{ inputs.NAME }}` runs it
 * when the caller gives none, so it is read as shell text, as an `env` value is, and it is the
 * value of `${{ inputs.NAME }}` (also `${{ github.event.inputs.NAME }}`) for the flags that a
 * command gets from it.
 */
const INPUTS_KEY = "inputs";
const DEFAULT_KEY = "default";
const INPUT_DEFAULT_DEPTH = 3;
const INPUT_NAME_INDEX = -2;
const BLANK = " ";
const SURROUNDING_QUOTES_RE = /^"(.*)"$/s;

export const isInputDefault = (value: DocumentString): boolean =>
  value.path.length >= INPUT_DEFAULT_DEPTH &&
  value.path.at(-1) === DEFAULT_KEY &&
  value.path.at(-INPUT_DEFAULT_DEPTH) === INPUTS_KEY;

/** A reference to an input in an expression: `inputs.NAME` or `github.event.inputs.NAME`. */
const INPUT_REFERENCE_RE = /(?<![\w.-])(?:github\.event\.)?inputs\.([A-Za-z_][A-Za-z0-9_-]*)/g;

/** The defaults of the inputs of a file, by name; the defaults of one name are read as one. */
function inputDefaults(strings: readonly DocumentString[]): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const value of strings.filter(isInputDefault)) {
    const name = String(value.path.at(INPUT_NAME_INDEX));
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
    const value = defaults.get(match[1] as string);
    return value === undefined ? [] : [value];
  });
  const literals = expressionLiterals(expression).map((literal) => literal.text);
  return [...inputs, ...literals].join(BLANK);
}

/** A text with each expression in it replaced by what it can give. */
function withExpressionValues(text: string, defaults: ReadonlyMap<string, string>): string {
  const parts: string[] = [];
  let copiedUpTo = 0;
  for (let open = text.indexOf(EXPRESSION_OPEN); open !== -1; ) {
    const end = expressionEnd(text, open) ?? text.length;
    parts.push(text.slice(copiedUpTo, open), expressionValue(text.slice(open, end), defaults));
    copiedUpTo = end;
    open = text.indexOf(EXPRESSION_OPEN, end);
  }
  parts.push(text.slice(copiedUpTo));
  return parts.join("");
}

/**
 * The variables with the values of workflow expressions: an argument that is one expression gets
 * the defaults of the inputs it reads and its string literals as its value, and the value of a
 * variable (`FL: ${{ inputs.flags }}` used as `$FL`) has its expressions read so too, so their old
 * flags are reported, as `$FLAGS` does for an `env` value.
 */
export function withInputDefaults(
  variables: FileVariables,
  strings: readonly DocumentString[],
): FileVariables {
  const defaults = inputDefaults(strings);
  const expressionsRead = (text: string): string => withExpressionValues(text, defaults);
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
