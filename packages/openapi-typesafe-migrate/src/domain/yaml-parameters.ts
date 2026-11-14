import type { DocumentString } from "./config-documents.js";
import { EXPRESSION_OPEN, mapExpressions } from "./workflow-expressions.js";
import { itemName } from "./yaml-list-items.js";

/**
 * The parameters of a YAML file kind: inputs of a GitHub action or reusable workflow, GitLab
 * `spec: inputs`, CircleCI `parameters`, Azure template `parameters`. The tool puts a parameter's
 * value into a command before the shell runs, so its default is command text, and a reference
 * to it gives the default when the caller passes none. Each kind's references are read as the
 * workflow expressions of input-defaults.ts: `$[[ inputs.gen ]]` and `<< parameters.gen >>` as
 * `${{ inputs.gen }}`, with the offsets kept.
 */
export interface YamlParameters {
  /** The name of the parameter whose default `strings[index]` is, or undefined. */
  readonly defaultOf: (strings: readonly DocumentString[], index: number) => string | undefined;
  /** Shell text with the references to parameters written as expressions of `inputs`. */
  readonly asExpressions: (text: string) => string;
}

const DEFAULT_KEY = "default";
const INPUTS_KEY = "inputs";
const PARAMETERS_KEY = "parameters";
const SPEC_KEY = "spec";
/** `spec.inputs.NAME.default`: the parts of a GitLab input default's path. */
const SPEC_INPUT_DEPTH = 4;
const PATH_TAIL: readonly number[] = [-1, -2, -3];

/** The name of a `KEY.NAME.default` value under `key`, or undefined. */
function defaultUnder(key: string, value: DocumentString | undefined): string | undefined {
  const [last, name, owner] = PATH_TAIL.map((at) => value?.path.at(at));
  return last === DEFAULT_KEY && owner === key && typeof name === "string" ? name : undefined;
}

export const NO_PARAMETERS: YamlParameters = {
  defaultOf: () => undefined,
  asExpressions: (text) => text,
};

/**
 * GitHub Actions: `inputs.NAME.default` of an action (`action.yml`) and of a reusable or manual
 * workflow (`on.workflow_call.inputs`), read as `${{ inputs.NAME }}`.
 */
export const GITHUB_INPUTS: YamlParameters = {
  defaultOf: (strings, index) => defaultUnder(INPUTS_KEY, strings[index]),
  asExpressions: (text) => text,
};

/** GitLab interpolation, `$[[ inputs.gen ]]`: its brackets are as long as an expression's. */
const GITLAB_INTERPOLATION_RE = /\$\[\[(.*?)\]\]/g;

/** GitLab CI inputs of the header document of a file (`spec: inputs: gen: default: …`). */
export const GITLAB_INPUTS: YamlParameters = {
  defaultOf: (strings, index) => {
    const value = strings[index];
    const isSpec = value?.path.length === SPEC_INPUT_DEPTH && value.path[0] === SPEC_KEY;
    return isSpec ? defaultUnder(INPUTS_KEY, value) : undefined;
  },
  asExpressions: (text) => text.replace(GITLAB_INTERPOLATION_RE, "$${{$1}}"),
};

/** `<< parameters.gen >>` and `<< pipeline.parameters.gen >>`, longer than their expressions. */
const CIRCLECI_PARAMETER_RE =
  /<<[ \t]*(?:pipeline\.)?parameters\.([A-Za-z_][A-Za-z0-9_-]*)[ \t]*>>/g;
const EXPRESSION_CLOSE = "}}";

/** A CircleCI parameter reference as `${{ inputs.NAME }}`, padded inside to its length. */
const asInputExpression = (written: string, name: string): string =>
  `${EXPRESSION_OPEN} ${INPUTS_KEY}.${name}`.padEnd(written.length - EXPRESSION_CLOSE.length, " ") +
  EXPRESSION_CLOSE;

/** CircleCI `parameters` of a job, a command, an executor or the pipeline, with defaults. */
export const CIRCLECI_PARAMETERS: YamlParameters = {
  defaultOf: (strings, index) => defaultUnder(PARAMETERS_KEY, strings[index]),
  asExpressions: (text) => text.replace(CIRCLECI_PARAMETER_RE, asInputExpression),
};

/** `parameters` before `.NAME` or `['NAME']` in an expression, not as part of a longer name. */
const AZURE_PARAMETERS_RE = /(?<![\w.-])parameters(?=\.|\[)/g;
/** `inputs` padded before to the length of `parameters`, so the name after it keeps its place. */
const AZURE_AS_INPUTS = INPUTS_KEY.padStart(PARAMETERS_KEY.length, " ");

/** Azure Pipelines template `parameters`: a list of `- name: … / default: …` items. */
export const AZURE_PARAMETERS: YamlParameters = {
  defaultOf: (strings, index) => {
    const [last, item, owner] = PATH_TAIL.map((at) => strings[index]?.path.at(at));
    const isDefault = last === DEFAULT_KEY && typeof item === "number" && owner === PARAMETERS_KEY;
    return isDefault ? itemName(strings, index) : undefined;
  },
  asExpressions: (text) =>
    mapExpressions(text, (expression) => expression.replace(AZURE_PARAMETERS_RE, AZURE_AS_INPUTS)),
};

/** The parameter defaults of a file, by value, with the name of the parameter of each. */
export function parameterDefaults(
  strings: readonly DocumentString[],
  parameters: YamlParameters,
): ReadonlyMap<DocumentString, string> {
  return new Map(
    strings.flatMap((value, index) => {
      const name = parameters.defaultOf(strings, index);
      return name === undefined ? [] : [[value, name] as const];
    }),
  );
}
