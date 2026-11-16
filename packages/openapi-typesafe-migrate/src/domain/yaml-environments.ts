import { TASKFILE_COMMAND_KEYS, YAML_COMMAND_KEYS } from "./yaml-command-keys.js";
import {
  AZURE_TEMPLATES,
  GITLAB_INCLUDES,
  NO_INCLUDES,
  TASKFILE_INCLUDES,
  type YamlIncludes,
} from "./yaml-includes.js";
import {
  AZURE_PARAMETERS,
  CIRCLECI_PARAMETERS,
  GITHUB_INPUTS,
  GITLAB_INPUTS,
  NO_PARAMETERS,
  type YamlParameters,
} from "./yaml-parameters.js";

/**
 * Where a YAML file kind sets the variables its commands run (`$GEN`), and how its commands name
 * them. A variable can hold a command, so each value is read as shell text: it changes only where
 * the generator is in command position, never in a sentence that names it.
 */
export interface YamlEnvironment {
  /** Keys whose map holds variables by name. */
  readonly keys: ReadonlySet<string>;
  /** Whether a variable can be a map with its value under `value` and its `options` (GitLab). */
  readonly hasValueMaps: boolean;
  /** Whether the map can be a list of `NAME=value` items (Compose). */
  readonly hasListItems: boolean;
  /** Whether the map can be a list of `{ name, value }` items (Azure Pipelines). */
  readonly hasNamedItems: boolean;
  /**
   * A reference that the file's tool replaces with a variable's value before the shell runs
   * (Task `{{.GEN}}`), with the name in one of its groups; global. A reference to a variable
   * the file does not set is read as written: Azure leaves `$(date)` as it is, and the shell
   * runs it as a command.
   */
  readonly reference: RegExp | undefined;
  /** The name the shell reads a variable of `key` by (Azure: `my.gen` as `$MY_GEN`). */
  readonly shellName: (name: string, key: string) => string;
  /** Whether the file's tool gives `$$` to the shell as one `$` (Compose). */
  readonly hasDollarEscapes: boolean;
}

/**
 * A YAML file kind: the keys that hold its commands, where it sets variables, its parameters, and
 * how it names the files it includes.
 */
export interface YamlCommandFile {
  readonly commandKeys: ReadonlySet<string>;
  readonly environment: YamlEnvironment;
  readonly parameters: YamlParameters;
  readonly includes: YamlIncludes;
  /** Whether the file holds Compose `services`, which `extends` and other files complete. */
  readonly hasServices?: boolean;
}

export const ENV_KEY = "env";
const ENVIRONMENT_KEY = "environment";
const VARIABLES_KEY = "variables";
const VARS_KEY = "vars";
const PLAIN: Omit<YamlEnvironment, "keys"> = {
  hasValueMaps: false,
  hasListItems: false,
  hasNamedItems: false,
  reference: undefined,
  shellName: (name) => name,
  hasDollarEscapes: false,
};

/** GitHub Actions, Gitea and Forgejo `env`, also of any other YAML file. */
export const DEFAULT_YAML_FILE: YamlCommandFile = {
  commandKeys: YAML_COMMAND_KEYS,
  environment: { ...PLAIN, keys: new Set([ENV_KEY]) },
  parameters: GITHUB_INPUTS,
  includes: NO_INCLUDES,
};

/** GitLab CI `variables` of the file and of a job; a value can be a map with `value`. */
export const GITLAB_CI_FILE: YamlCommandFile = {
  commandKeys: YAML_COMMAND_KEYS,
  environment: { ...PLAIN, keys: new Set([ENV_KEY, VARIABLES_KEY]), hasValueMaps: true },
  parameters: GITLAB_INPUTS,
  includes: GITLAB_INCLUDES,
};

const CI_ENVIRONMENT: YamlEnvironment = { ...PLAIN, keys: new Set([ENV_KEY, ENVIRONMENT_KEY]) };

/** Drone and Woodpecker `environment` of a pipeline or a step. */
export const CI_ENVIRONMENT_FILE: YamlCommandFile = {
  commandKeys: YAML_COMMAND_KEYS,
  environment: CI_ENVIRONMENT,
  parameters: NO_PARAMETERS,
  includes: NO_INCLUDES,
};

/** CircleCI `environment` of a job, a step or an executor, and its `parameters`. */
export const CIRCLECI_FILE: YamlCommandFile = {
  commandKeys: YAML_COMMAND_KEYS,
  environment: CI_ENVIRONMENT,
  parameters: CIRCLECI_PARAMETERS,
  includes: NO_INCLUDES,
};

/**
 * Docker Compose `environment` of a service, as a map or as a list of `NAME=value`. Compose
 * gives `$$GEN` to the container's shell as `$GEN`, which reads the service's `environment`.
 */
export const COMPOSE_FILE: YamlCommandFile = {
  commandKeys: YAML_COMMAND_KEYS,
  environment: {
    ...PLAIN,
    keys: new Set([ENV_KEY, ENVIRONMENT_KEY]),
    hasListItems: true,
    hasDollarEscapes: true,
  },
  parameters: NO_PARAMETERS,
  includes: NO_INCLUDES,
  hasServices: true,
};

/**
 * Task `vars` and `env`, of the file and of a task. Task puts `{{.GEN}}` (Go template text) into
 * a command before the shell runs it, as the shell expands `$GEN`.
 */
export const TASKFILE: YamlCommandFile = {
  commandKeys: TASKFILE_COMMAND_KEYS,
  environment: {
    ...PLAIN,
    keys: new Set([ENV_KEY, VARS_KEY]),
    reference: /\{\{-?[ \t]*\.([A-Za-z_][A-Za-z0-9_]*)[ \t]*-?\}\}/g,
  },
  parameters: NO_PARAMETERS,
  includes: TASKFILE_INCLUDES,
};

const AZURE_NAME_SEPARATOR_RE = /\./g;
const AZURE_SHELL_SEPARATOR = "_";

/**
 * Azure Pipelines `variables` of the file, a stage and a job, as a map or as a list of
 * `{ name, value }` items (a `group` or `template` item sets none the tool can read), and `env` of
 * a step. A script reads a pipeline variable as `$GEN`, by its name upper-cased with `_` for `.`,
 * and Azure puts the value of a macro `$(gen)` or an expression `${{ variables.gen }}` into the
 * script before it runs.
 */
export const AZURE_PIPELINES_FILE: YamlCommandFile = {
  commandKeys: YAML_COMMAND_KEYS,
  environment: {
    ...PLAIN,
    keys: new Set([ENV_KEY, VARIABLES_KEY]),
    hasNamedItems: true,
    reference:
      /\$\(([A-Za-z_][A-Za-z0-9_.]*)\)|\$\{\{[ \t]*variables\.([A-Za-z_][A-Za-z0-9_.]*)[ \t]*\}\}/g,
    shellName: (name, key) =>
      key === VARIABLES_KEY
        ? name.replace(AZURE_NAME_SEPARATOR_RE, AZURE_SHELL_SEPARATOR).toUpperCase()
        : name,
  },
  parameters: AZURE_PARAMETERS,
  includes: AZURE_TEMPLATES,
};

/**
 * A GitHub Actions expression that reads one `env` variable: `${{ env.NAME }}`. The runner puts its
 * value into the command before the shell runs, as the shell expands `$NAME`. Every file kind
 * reads it.
 */
const ENV_EXPRESSION_RE = /\$\{\{[ \t]*env\.([A-Za-z_][A-Za-z0-9_]*)[ \t]*\}\}/g;
const WORKFLOW_ENVIRONMENT: YamlEnvironment = {
  ...PLAIN,
  keys: new Set(),
  reference: ENV_EXPRESSION_RE,
};

/** A reference read as `$NAME`, padded with blanks so that every offset stays. */
const asShellVariable = (reference: string, name: string): string =>
  `$${name}`.padEnd(reference.length, " ");

/** The YAML file kinds, each with the references its tool replaces. */
const YAML_FILE_KINDS: readonly YamlCommandFile[] = [
  DEFAULT_YAML_FILE,
  GITLAB_CI_FILE,
  CI_ENVIRONMENT_FILE,
  CIRCLECI_FILE,
  COMPOSE_FILE,
  TASKFILE,
  AZURE_PIPELINES_FILE,
];

/** The name of the variable that a match of a reference names, as the shell reads it. */
const referencedName = (environment: YamlEnvironment, groups: readonly unknown[]): string =>
  environment.shellName(
    groups.find((part): part is string => typeof part === "string") ?? "",
    VARIABLES_KEY,
  );

/**
 * The variables that the references of a text name, as the shell reads them, by the references
 * of every file kind's tool (`{{.GEN}}`, `$(gen)`, `${{ variables.gen }}`) and the workflow
 * expressions (`${{ env.GEN }}`): a file that one of them includes can name a variable that way.
 */
export function referencedVariables(text: string): string[] {
  const environments = [...YAML_FILE_KINDS.map((kind) => kind.environment), WORKFLOW_ENVIRONMENT];
  return environments.flatMap((environment) =>
    environment.reference === undefined
      ? []
      : [...text.matchAll(environment.reference)].map((match) =>
          referencedName(environment, match.slice(1)),
        ),
  );
}

/**
 * How a file's tool replaces references: its environment, the variables set for it (by the file,
 * and to the generator by the other YAML files of the project, which reach a file they include),
 * and how it names its parameters.
 */
export interface VariableReferences {
  readonly environment: YamlEnvironment;
  readonly names: ReadonlySet<string>;
  readonly parameters: YamlParameters;
}

/** The references of the file's tool in `text` read as `$NAME`, where the tool replaces them. */
function withToolReferences(text: string, { environment, names }: VariableReferences): string {
  const { reference } = environment;
  if (reference === undefined) {
    return text;
  }
  return text.replace(reference, (written: string, ...groups: unknown[]) => {
    const name = referencedName(environment, groups);
    return names.has(name) ? asShellVariable(written, name) : written;
  });
}

/** A `$$` before a name or a `{`: Compose gives it to the shell as one `$`. */
const DOLLAR_ESCAPE_RE = /\$\$([A-Za-z_][A-Za-z0-9_]*|\{[^}]*\})/g;

/** `$$GEN` read as `$GEN`, padded with a blank after it so that every offset stays. */
const withoutDollarEscapes = (text: string): string =>
  text.replace(DOLLAR_ESCAPE_RE, (written: string, name: string) =>
    `$${name}`.padEnd(written.length, " "),
  );

/** Shell text with the references that a tool replaces before the shell runs read as `$NAME`. */
export function withVariableReferences(text: string, references?: VariableReferences): string {
  const parameters = references?.parameters.asExpressions(text) ?? text;
  const expressions = parameters.replace(ENV_EXPRESSION_RE, asShellVariable);
  if (references === undefined) {
    return expressions;
  }
  const escaped = references.environment.hasDollarEscapes
    ? withoutDollarEscapes(expressions)
    : expressions;
  return withToolReferences(escaped, references);
}
