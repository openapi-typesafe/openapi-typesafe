import { type ComposeServices, serviceOf } from "./compose-services.js";
import {
  type DocumentPath,
  type DocumentString,
  type DocumentValue,
  isDocumentString,
  ownerKey,
} from "./config-documents.js";
import type { ContainerUnknown } from "./migration-findings.js";

/**
 * The containers of a YAML file, as their keys pair in one map: Compose, GitLab and CircleCI
 * images append `command` to `entrypoint`, Kubernetes appends `args` to `command`, and a GitHub
 * Docker action (`runs`, or the `with` of a `docker://` step) `args` to `entrypoint`, also through
 * a merge key (`<<: *gen`). A key the map sets itself wins over the one a merge key gives, whatever
 * its value: Compose `entrypoint: []`, `entrypoint: null` and `entrypoint: !reset` clear it.
 * A Compose service gets the keys it does not set from the service its `extends` names. A value
 * that only adds to a command (`args` alone) runs the image's own program, which the file does not
 * name. yaml-entrypoints.ts reads the commands they run.
 */

/** The key of an entrypoint, and the keys of its arguments in the same map, the first one used. */
const ARGUMENT_KEYS: ReadonlyMap<string, readonly string[]> = new Map([
  ["entrypoint", ["command", "args"]],
  ["command", ["args"]],
]);
const PAIRED_KEYS: ReadonlySet<string> = new Set([
  ...ARGUMENT_KEYS.keys(),
  ...[...ARGUMENT_KEYS.values()].flat(),
]);
/** The key of a YAML merge: its alias or list of aliases adds the entries of their maps. */
const MERGE_KEY = "<<";
/** The key of the arguments that a container gives the image's own program when it is alone. */
const IMAGE_ARGUMENTS_KEY = "args";
/** The keys a Compose service gets from the service it extends. */
const EXTENDED_KEYS = ["entrypoint", "command"] as const;

/** One value of a paired key: its strings (one scalar, the items of one list, or none). */
export interface KeyValue {
  readonly map: string;
  readonly key: string;
  readonly strings: DocumentString[];
  /** Whether a merge key gives the value, which a key of the map itself overrides. */
  readonly isMerged: boolean;
}

const isItemPath = (path: DocumentPath): boolean => typeof path.at(-1) === "number";

export const isItem = (string: DocumentString): boolean => isItemPath(string.path);

/** Whether a value is an item of a container's list, which the container commands read. */
export const isContainerListItem = (string: DocumentString): boolean =>
  isItem(string) && PAIRED_KEYS.has(String(string.path.at(-2)));

export const isList = (value: KeyValue): boolean =>
  value.strings[0] !== undefined && isItem(value.strings[0]);

/**
 * The map that holds a value, as text: a value that a merge key gives (`<<: *gen`, `<<: [*a,
 * *b]`) belongs to the map that merges it.
 */
function mapOf(value: DocumentValue): { readonly map: string; readonly isMerged: boolean } {
  const path = value.path.slice(0, isItemPath(value.path) ? -2 : -1);
  let isMerged = false;
  for (;;) {
    if (path.at(-1) === MERGE_KEY) {
      path.pop();
    } else if (typeof path.at(-1) === "number" && path.at(-2) === MERGE_KEY) {
      path.splice(-2);
    } else {
      return { map: JSON.stringify(path), isMerged };
    }
    isMerged = true;
  }
}

/** Whether `string` is the next item of the list that `value` holds. */
function isNextItem(value: KeyValue | undefined, string: DocumentString): boolean {
  const last = value?.strings.at(-1);
  return (
    last !== undefined &&
    isItem(last) &&
    isItem(string) &&
    JSON.stringify(last.path.slice(0, -1)) === JSON.stringify(string.path.slice(0, -1)) &&
    Number(string.path.at(-1)) > Number(last.path.at(-1))
  );
}

/** Whether a value is the whole value of a paired key, or one item of its list. */
function isPairedValue(value: DocumentValue): boolean {
  const key = ownerKey(value.path) ?? "";
  const isValue = isItemPath(value.path) ? value.path.at(-2) === key : value.path.at(-1) === key;
  // An empty item (`[null]`) holds no word; an empty value of the key itself still sets it.
  return PAIRED_KEYS.has(key) && isValue && (isDocumentString(value) || !isItemPath(value.path));
}

/**
 * The values of the paired keys, in the order of the text, also where an alias gives them again.
 * A stream of documents repeats a path, so a scalar, or a list item whose index does not grow,
 * starts another value. An empty value (`entrypoint: []`) is a value with no strings.
 */
function keyValues(values: readonly DocumentValue[]): KeyValue[] {
  const found: KeyValue[] = [];
  for (const value of values.filter(isPairedValue)) {
    const last = found.at(-1);
    if (isDocumentString(value) && last !== undefined && isNextItem(last, value)) {
      last.strings.push(value);
    } else {
      const key = ownerKey(value.path) as string;
      const strings = isDocumentString(value) ? [value] : [];
      found.push({ ...mapOf(value), key, strings });
    }
  }
  return found;
}

/** The paired values of one map (its path as text): its own, and those its merge keys give. */
interface MapValues {
  readonly map: string;
  readonly own: Map<string, KeyValue>;
  readonly merged: Map<string, KeyValue>;
}

/**
 * The paired values of each map. A key of its own that the map already has starts another map at
 * the same path, a document of the stream; the first merge that gives a key gives it.
 */
function mapValues(values: readonly KeyValue[]): MapValues[] {
  const maps: MapValues[] = [];
  const latest = new Map<string, MapValues>();
  for (const value of values) {
    let map = latest.get(value.map);
    if (map === undefined || (!value.isMerged && map.own.has(value.key))) {
      map = { map: value.map, own: new Map(), merged: new Map() };
      maps.push(map);
      latest.set(value.map, map);
    }
    const values = value.isMerged ? map.merged : map.own;
    if (!values.has(value.key)) {
      values.set(value.key, value);
    }
  }
  return maps;
}

/** One container: its entrypoint (or its only part) and the command it gets as arguments. */
export interface Container {
  readonly entrypoint: KeyValue;
  readonly command: KeyValue | undefined;
  readonly unknown?: ContainerUnknown;
}

/** The container of a map: the value of each key that the map's own keys do not override. */
function containerOf(map: MapValues, services: ComposeServices | undefined): Container[] {
  const keyValue = (key: string): KeyValue | undefined => map.own.get(key) ?? map.merged.get(key);
  const service = serviceOf(JSON.parse(map.map) as DocumentPath) ?? "";
  for (const [key, argumentKeys] of ARGUMENT_KEYS) {
    const entrypoint = keyValue(key);
    if (entrypoint !== undefined) {
      const argumentKey = argumentKeys.find((found) => keyValue(found) !== undefined);
      const command = argumentKey === undefined ? undefined : keyValue(argumentKey);
      const isUnknown = services?.unknown.has(service) === true;
      return [{ entrypoint, command, ...(isUnknown ? { unknown: "other-file" } : {}) }];
    }
  }
  const imageArguments = keyValue(IMAGE_ARGUMENTS_KEY);
  return imageArguments === undefined
    ? []
    : [{ entrypoint: imageArguments, command: undefined, unknown: "image-program" }];
}

/** The value of a key that a service gets from the services it extends in the same file. */
function inheritedValue(
  service: string,
  key: string,
  context: ExtendContext,
): KeyValue | undefined {
  const extension = context.services.extensions.get(service);
  const base = extension?.isOtherFile === false ? extension.base : undefined;
  if (base === undefined || context.seen.has(base)) {
    return undefined;
  }
  const map = context.byService.get(base);
  const seen = new Set([...context.seen, service]);
  return (
    map?.own.get(key) ?? map?.merged.get(key) ?? inheritedValue(base, key, { ...context, seen })
  );
}

interface ExtendContext {
  readonly byService: ReadonlyMap<string, MapValues>;
  readonly services: ComposeServices;
  readonly seen: ReadonlySet<string>;
}

/** The maps with the keys that each service gets from the service it extends in the file. */
function withExtendedKeys(maps: readonly MapValues[], services: ComposeServices): MapValues[] {
  const byService = new Map<string, MapValues>();
  for (const map of maps) {
    const service = serviceOf(JSON.parse(map.map) as DocumentPath);
    if (service !== undefined) {
      byService.set(service, map);
    }
  }
  const context: ExtendContext = { byService, services, seen: new Set() };
  for (const [service, map] of byService) {
    // A key of the map's own wins over a merged one when the container is read (containerOf).
    const missing = EXTENDED_KEYS.filter((key) => !map.merged.has(key));
    for (const key of missing) {
      const value = inheritedValue(service, key, context);
      if (value !== undefined) {
        map.merged.set(key, value);
      }
    }
  }
  return [...maps];
}

/**
 * The containers of the maps of a YAML file, from its string and empty values where used; with
 * the services of a Compose file, its `extends` are read and its unknown containers marked.
 */
export function yamlContainers(
  values: readonly DocumentValue[],
  services?: ComposeServices,
): Container[] {
  const maps = mapValues(keyValues(values));
  const read = services === undefined ? maps : withExtendedKeys(maps, services);
  return read.flatMap((map) => containerOf(map, services));
}
