import type { DocumentString } from "./config-documents.js";
import { TASKFILE_COMMAND_KEYS, YAML_COMMAND_KEYS } from "./yaml-command-keys.js";

/**
 * Where a YAML file kind sets the variables its commands run (`$GEN`), and how its commands name
 * them. A variable can hold a command, so each value is read as shell text: it changes only where
 * the generator is in command position, never in a sentence that names it.
 */
export interface YamlEnvironment {
  /** Keys whose map holds variables by name. */
  readonly keys: ReadonlySet<string>;
  /** Whether a variable can be a map with its value under `value` (GitLab). */
  readonly hasValueMaps: boolean;
  /** Whether the map can be a list of `NAME=value` items (Compose). */
  readonly hasListItems: boolean;
  /**
   * A reference that the file's tool replaces with a variable's value before the shell runs
   * (Task `{{.GEN}}`), with the name as its first group; global.
   */
  readonly reference: RegExp | undefined;
}

/** A YAML file kind: the keys that hold its commands and where it sets variables. */
export interface YamlCommandFile {
  readonly commandKeys: ReadonlySet<string>;
  readonly environment: YamlEnvironment;
}

const ENV_KEY = "env";
const ENVIRONMENT_KEY = "environment";
const VARIABLES_KEY = "variables";
const VARS_KEY = "vars";
const VALUE_KEY = "value";
const PLAIN: Omit<YamlEnvironment, "keys"> = {
  hasValueMaps: false,
  hasListItems: false,
  reference: undefined,
};

/** GitHub Actions, Gitea and Forgejo `env`, also of any other YAML file. */
export const DEFAULT_YAML_FILE: YamlCommandFile = {
  commandKeys: YAML_COMMAND_KEYS,
  environment: { ...PLAIN, keys: new Set([ENV_KEY]) },
};

/** GitLab CI `variables` of the file and of a job; a value can be a map with `value`. */
export const GITLAB_CI_FILE: YamlCommandFile = {
  commandKeys: YAML_COMMAND_KEYS,
  environment: { ...PLAIN, keys: new Set([ENV_KEY, VARIABLES_KEY]), hasValueMaps: true },
};

/** CircleCI, Drone and Woodpecker `environment` of a job, a step or an executor. */
export const CI_ENVIRONMENT_FILE: YamlCommandFile = {
  commandKeys: YAML_COMMAND_KEYS,
  environment: { ...PLAIN, keys: new Set([ENV_KEY, ENVIRONMENT_KEY]) },
};

/** Docker Compose `environment` of a service, as a map or as a list of `NAME=value`. */
export const COMPOSE_FILE: YamlCommandFile = {
  commandKeys: YAML_COMMAND_KEYS,
  environment: { ...PLAIN, keys: new Set([ENV_KEY, ENVIRONMENT_KEY]), hasListItems: true },
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
};

/** A variable that a YAML value sets: its name, and how much of the value its head takes. */
export interface EnvironmentEntry {
  readonly name: string;
  /** The length of `NAME=` before the value of a list item, else 0. */
  readonly head: number;
}

const LIST_ITEM_RE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/** The variable that a value sets in `environment`, or undefined when it sets none. */
export function environmentEntry(
  value: DocumentString,
  { keys, hasValueMaps, hasListItems }: YamlEnvironment,
): EnvironmentEntry | undefined {
  const { path } = value;
  const [last, owner, outer] = [path.at(-1), path.at(-2), path.at(-3)];
  if (typeof last === "string" && keys.has(String(owner))) {
    return { name: last, head: 0 };
  }
  if (hasValueMaps && last === VALUE_KEY && keys.has(String(outer))) {
    return { name: String(owner), head: 0 };
  }
  const item = hasListItems && typeof last === "number" && keys.has(String(owner));
  const name = item ? LIST_ITEM_RE.exec(value.value)?.[1] : undefined;
  return name === undefined ? undefined : { name, head: name.length + 1 };
}

/**
 * A GitHub Actions expression that reads one `env` variable: `${{ env.NAME }}`. The runner puts its
 * value into the command before the shell runs, as the shell expands `$NAME`.
 */
const ENV_EXPRESSION_RE = /\$\{\{[ \t]*env\.([A-Za-z_][A-Za-z0-9_]*)[ \t]*\}\}/g;

/** A reference read as `$NAME`, padded with blanks so that every offset stays. */
const asShellVariable = (reference: string, name: string): string =>
  `$${name}`.padEnd(reference.length, " ");

/** Shell text with the references that a tool replaces before the shell runs read as `$NAME`. */
export function withVariableReferences(text: string, environment?: YamlEnvironment): string {
  const expressions = text.replace(ENV_EXPRESSION_RE, asShellVariable);
  const { reference } = environment ?? {};
  return reference === undefined ? expressions : expressions.replace(reference, asShellVariable);
}
