import type { DocumentPath, DocumentString } from "./config-documents.js";
import type { ManualStep } from "./migration-findings.js";
import { namesOriginalPackage } from "./package-names.js";
import { ENV_KEY, type YamlEnvironment } from "./yaml-environments.js";
import { itemName } from "./yaml-list-items.js";

/**
 * The values of a YAML file that set variables, as its file kind names its variable maps
 * (yaml-environments.ts), and where each one is set.
 */

/**
 * A variable that a YAML value sets: its name, how much of the value its head takes, and the
 * part of the file whose commands get it.
 */
export interface EnvironmentEntry {
  readonly name: string;
  /** The length of `NAME=` before the value of a list item, else 0. */
  readonly head: number;
  /**
   * The path that the commands which get the variable are under. A step, a job or a stage that
   * is a list item runs with its own maps only (an Azure step `env`, a GitHub step `env`); one
   * that a map names can be extended by name (GitLab `extends`), so its maps count for the file.
   */
  readonly scope: DocumentPath;
}

const VALUE_KEY = "value";
const OPTIONS_KEY = "options";
const LIST_ITEM_RE = /^([A-Za-z_][A-Za-z0-9_]*)=/;
/** The last parts of a value's path: its own key or index, its owner's, and the two above. */
const PATH_TAIL: readonly number[] = [-1, -2, -3, -4];

/** Whether a value is the `value` of a list item under one of `keys` (`- name: X / value: Y`). */
const isNamedItemValue = (value: DocumentString, keys: ReadonlySet<string>): boolean =>
  value.path.at(-1) === VALUE_KEY &&
  typeof value.path.at(-2) === "number" &&
  keys.has(String(value.path.at(-3)));

/** Where a value sets a variable: its name as written, and the key of its map. */
interface EntryPlace {
  readonly name: string | undefined;
  readonly key: string;
  readonly head?: number;
}

/** The place where `strings[index]` sets a variable in `environment`, or undefined. */
function entryPlace(
  strings: readonly DocumentString[],
  index: number,
  { keys, hasValueMaps, hasListItems, hasNamedItems }: YamlEnvironment,
): EntryPlace | undefined {
  const value = strings[index] as DocumentString;
  const [last, owner, outer, optionOf] = PATH_TAIL.map((at) => value.path.at(at));
  const isKey = (part: unknown): part is string => keys.has(String(part));
  if (typeof last === "string" && isKey(owner)) {
    return { name: last, key: owner };
  }
  if (hasValueMaps && last === VALUE_KEY && typeof owner === "string" && isKey(outer)) {
    return { name: owner, key: outer };
  }
  // The value of a GitLab variable must be one of its `options`: each is a value it can have.
  const isOption = typeof last === "number" && owner === OPTIONS_KEY && typeof outer === "string";
  if (hasValueMaps && isOption && isKey(optionOf)) {
    return { name: outer, key: optionOf };
  }
  if (hasNamedItems && isNamedItemValue(value, keys)) {
    return { name: itemName(strings, index), key: String(outer) };
  }
  const isItem = hasListItems && typeof last === "number" && isKey(owner);
  const name = isItem ? LIST_ITEM_RE.exec(value.value)?.[1] : undefined;
  const head = (name?.length ?? 0) + 1;
  return name === undefined ? undefined : { name, key: String(owner), head };
}

/**
 * The scope of the map under `key` that the value at `path` is in: the path up to the last list
 * item above the map, if any. A variable name below the key is a string, so the last `key` of the
 * path is the map's own, or a name that adds no list item.
 */
function scopeOf(path: DocumentPath, key: string): DocumentPath {
  const owner = path.slice(0, path.lastIndexOf(key));
  return owner.slice(0, owner.findLastIndex((part) => typeof part === "number") + 1);
}

/** The variables that the values of a file set in `environment`, by value. */
export function environmentEntries(
  strings: readonly DocumentString[],
  environment: YamlEnvironment,
): ReadonlyMap<DocumentString, EnvironmentEntry> {
  return new Map(
    strings.flatMap((value, index) => {
      const place = entryPlace(strings, index, environment);
      if (place?.name === undefined) {
        return [];
      }
      const name = environment.shellName(place.name, place.key);
      const head = place.head ?? 0;
      const scope = scopeOf(value.path, place.key);
      return [[value, { name, head, scope }] as const];
    }),
  );
}

/** Whether a value at `path` is in the part of the file that gets the variable of `entry`. */
export const isInScope = (path: DocumentPath, entry: EnvironmentEntry): boolean =>
  entry.scope.every((part, at) => path[at] === part);

const ENV_ITEM_KEYS: ReadonlySet<string> = new Set([ENV_KEY]);

/**
 * The `env` items of a Kubernetes container (`- name: GEN / value: openapi-typescript`) that name
 * an old package. Kubernetes gives such a value to the program as it is and puts it into
 * `command` and `args` for `$(GEN)`, where no shell reads it, so the tool reports it.
 */
export function environmentItemSteps(
  strings: readonly DocumentString[],
  entries: ReadonlyMap<DocumentString, EnvironmentEntry>,
  locate: (offset: number) => string,
): ManualStep[] {
  return strings
    .filter((value) => isNamedItemValue(value, ENV_ITEM_KEYS) && !entries.has(value))
    .filter((value) => namesOriginalPackage(value.value))
    .map((value) => ({
      kind: "old-name-in-command",
      location: locate(value.start),
      word: value.value,
    }));
}
