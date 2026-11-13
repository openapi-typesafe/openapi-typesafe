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
const NAME_KEY = "name";
const PLAIN: Omit<YamlEnvironment, "keys"> = {
  hasValueMaps: false,
  hasListItems: false,
  hasNamedItems: false,
  reference: undefined,
  shellName: (name) => name,
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
};

/** A variable that a YAML value sets: its name, and how much of the value its head takes. */
export interface EnvironmentEntry {
  readonly name: string;
  /** The length of `NAME=` before the value of a list item, else 0. */
  readonly head: number;
}

const LIST_ITEM_RE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/** The `name` of the list item that `strings[index]` is the `value` of, or undefined. */
function itemName(strings: readonly DocumentString[], index: number): string | undefined {
  const item = strings[index]?.path.slice(0, -1) ?? [];
  const isInItem = (string: DocumentString | undefined): boolean =>
    string !== undefined && item.every((part, at) => string.path[at] === part);
  const isName = (string: DocumentString): boolean =>
    string.path.length === item.length + 1 && string.path.at(-1) === NAME_KEY;
  let [first, last] = [index, index];
  while (isInItem(strings[first - 1])) {
    first -= 1;
  }
  while (isInItem(strings[last + 1])) {
    last += 1;
  }
  return strings.slice(first, last + 1).find(isName)?.value;
}

/** Whether a value is the `value` of a list item under one of `keys` (`- name: X / value: Y`). */
const isNamedItemValue = (value: DocumentString, keys: ReadonlySet<string>): boolean =>
  value.path.at(-1) === VALUE_KEY &&
  typeof value.path.at(-2) === "number" &&
  keys.has(String(value.path.at(-3)));

/** The variable that `strings[index]` sets in `environment`, or undefined when it sets none. */
function environmentEntry(
  strings: readonly DocumentString[],
  index: number,
  environment: YamlEnvironment,
): EnvironmentEntry | undefined {
  const value = strings[index] as DocumentString;
  const { keys, hasValueMaps, hasListItems, hasNamedItems, shellName } = environment;
  const [last, owner, outer] = [value.path.at(-1), value.path.at(-2), value.path.at(-3)];
  const named = (name: string | undefined, key: unknown, head = 0): EnvironmentEntry | undefined =>
    name === undefined ? undefined : { name: shellName(name, String(key)), head };
  if (typeof last === "string" && keys.has(String(owner))) {
    return named(last, owner);
  }
  if (hasValueMaps && last === VALUE_KEY && typeof owner === "string" && keys.has(String(outer))) {
    return named(owner, outer);
  }
  if (hasNamedItems && isNamedItemValue(value, keys)) {
    return named(itemName(strings, index), outer);
  }
  const item = hasListItems && typeof last === "number" && keys.has(String(owner));
  const name = item ? LIST_ITEM_RE.exec(value.value)?.[1] : undefined;
  return named(name, owner, (name?.length ?? 0) + 1);
}

/** The variables that the values of a file set in `environment`, by value. */
export function environmentEntries(
  strings: readonly DocumentString[],
  environment: YamlEnvironment,
): ReadonlyMap<DocumentString, EnvironmentEntry> {
  return new Map(
    strings.flatMap((value, index) => {
      const entry = environmentEntry(strings, index, environment);
      return entry === undefined ? [] : [[value, entry] as const];
    }),
  );
}

/**
 * A GitHub Actions expression that reads one `env` variable: `${{ env.NAME }}`. The runner puts its
 * value into the command before the shell runs, as the shell expands `$NAME`.
 */
const ENV_EXPRESSION_RE = /\$\{\{[ \t]*env\.([A-Za-z_][A-Za-z0-9_]*)[ \t]*\}\}/g;

/** A reference read as `$NAME`, padded with blanks so that every offset stays. */
const asShellVariable = (reference: string, name: string): string =>
  `$${name}`.padEnd(reference.length, " ");

/** How a file's tool replaces references: its environment, and the variables the file sets. */
export interface VariableReferences {
  readonly environment: YamlEnvironment;
  readonly names: ReadonlySet<string>;
}

/** The references of the file's tool in `text` read as `$NAME`, where the tool replaces them. */
function withToolReferences(text: string, { environment, names }: VariableReferences): string {
  const { reference, shellName } = environment;
  if (reference === undefined) {
    return text;
  }
  return text.replace(reference, (written: string, ...groups: unknown[]) => {
    const group = groups.find((part): part is string => typeof part === "string") ?? "";
    const name = shellName(group, VARIABLES_KEY);
    return names.has(name) ? asShellVariable(written, name) : written;
  });
}

/** Shell text with the references that a tool replaces before the shell runs read as `$NAME`. */
export function withVariableReferences(text: string, references?: VariableReferences): string {
  const expressions = text.replace(ENV_EXPRESSION_RE, asShellVariable);
  return references === undefined ? expressions : withToolReferences(expressions, references);
}
