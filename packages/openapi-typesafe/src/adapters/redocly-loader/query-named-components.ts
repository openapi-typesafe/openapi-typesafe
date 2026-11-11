import {
  appendPointer,
  canonicalRef,
  parseRefPointer,
  ROOT_POINTER,
} from "../../domain/openapi/json-pointer.js";
import { type DocumentNames, queryDocumentNames } from "./query-document-names.js";
import { findMappings, findRefHolders } from "./ref-holders.js";
import type { LoadedDocument } from "./unsupported-keys.js";

/**
 * Redocly 1.x bundles an external `$ref` into a component named after the last segment of the
 * document's URL, without its extension, when the pointer gives no free name (a `$ref` to a whole
 * document, or two targets with the same pointer). The query stays in that name, and a query holds
 * API keys and signatures, so `https://host/schemas/pet?token=…` became the component
 * `pet?token=…` in the generated file and in messages (threat model T4b). This renames such a
 * component after the URL without its query: `pet`, with a `-2` suffix when that name is taken.
 * Each component is matched to its document by its node, since two URLs can give one name.
 */

type Components = Record<string, Record<string, unknown>>;

/** The keys of each `components` group before bundling: the bundle edits the document in place. */
export type ComponentKeys = ReadonlyMap<string, ReadonlySet<string>>;

/** Old and new name of each renamed component, per `components` group. */
type Renames = Map<string, Map<string, string>>;

const COMPONENTS_KEY = "components";
/** What Redocly puts between the base name and the rest of a component name. */
const NAME_SUFFIX_STARTS = ["_", "-"];
const FIRST_SERIAL = 2;
/**
 * The serial Redocly adds when a name is taken (`pet-2`). Two URLs that differ only in the query
 * took one name; without the query they may not, so the serial is chosen again (`freeName`).
 */
const REDOCLY_SERIAL_RE = /-\d+$/;

function isContainer(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function componentsOf(document: unknown): Components {
  const components = isContainer(document) ? document[COMPONENTS_KEY] : undefined;
  if (!isContainer(components)) {
    return {};
  }
  const groups: Components = {};
  for (const [group, entries] of Object.entries(components)) {
    if (isContainer(entries)) {
      groups[group] = entries;
    }
  }
  return groups;
}

/** The keys of every `components` group of a document. */
export function componentKeysOf(document: unknown): ComponentKeys {
  const keys = new Map<string, ReadonlySet<string>>();
  for (const [group, entries] of Object.entries(componentsOf(document))) {
    keys.set(group, new Set(Object.keys(entries)));
  }
  return keys;
}

/** The name a component of a document with a query gets; undefined for any other component. */
function queryFreeName(key: string, names: DocumentNames | undefined): string | undefined {
  if (names === undefined) {
    return undefined;
  }
  const { named, clean } = names;
  const hasBaseName =
    key === named || NAME_SUFFIX_STARTS.some((start) => key.startsWith(`${named}${start}`));
  return hasBaseName
    ? `${clean}${key.slice(named.length).replace(REDOCLY_SERIAL_RE, "")}`
    : undefined;
}

function freeName(name: string, taken: ReadonlySet<string>): string {
  let free = name;
  for (let serial = FIRST_SERIAL; taken.has(free); serial += 1) {
    free = `${name}-${serial}`;
  }
  return free;
}

/** Rename the bundled components of one group in place, keeping their order. */
function renameGroup(
  entries: Record<string, unknown>,
  keysBefore: ReadonlySet<string>,
  documentNames: ReadonlyMap<object, DocumentNames>,
): Map<string, string> {
  const renames = new Map<string, string>();
  const taken = new Set(Object.keys(entries));
  for (const key of Object.keys(entries)) {
    const node = entries[key];
    const names = typeof node === "object" && node !== null ? documentNames.get(node) : undefined;
    const name = keysBefore.has(key) ? undefined : queryFreeName(key, names);
    if (name !== undefined) {
      taken.delete(key);
      const free = freeName(name, taken);
      taken.add(free);
      renames.set(key, free);
    }
  }
  for (const [key, value] of Object.entries(entries)) {
    delete entries[key];
    entries[renames.get(key) ?? key] = value;
  }
  return renames;
}

/** Rewrites pointers and messages that name a renamed component. */
export interface ComponentRenaming {
  /** The pointer with a renamed component's new name; any other text as it is. */
  readonly pointer: (pointer: string) => string;
  /** The text with each renamed component's old name replaced by its new name. */
  readonly text: (text: string) => string;
  /**
   * Whether the problem is Redocly's report of two components with one name that the new names
   * tell apart: it renamed `new-api` to `new-api-2`, and the documents are now `pet` and `owner`.
   */
  readonly isResolvedCollision: (message: string) => boolean;
}

/** The warning Redocly 1.34 gives when it adds a serial to a component name. */
const COLLISION_RE =
  /^Two schemas are referenced with the same name but different content\. Renamed (.+) to (.+)\.$/;
const SERIAL_RE = /^-\d+$/;

function resolvesCollision(message: string, renames: Renames): boolean {
  const [, first, second] = COLLISION_RE.exec(message) ?? [];
  if (first === undefined || second === undefined) {
    return false;
  }
  const renamed = new Map([...renames.values()].flatMap((group) => [...group]));
  const [newFirst, newSecond] = [renamed.get(first) ?? first, renamed.get(second) ?? second];
  return !(newSecond.startsWith(newFirst) && SERIAL_RE.test(newSecond.slice(newFirst.length)));
}

function renamedPointer(pointer: string, renames: Renames): string {
  if (!pointer.startsWith(`${ROOT_POINTER}/`)) {
    return pointer;
  }
  const [components, group = "", name = "", ...rest] = parseRefPointer(canonicalRef(pointer));
  const renamed = components === COMPONENTS_KEY ? renames.get(group)?.get(name) : undefined;
  return renamed === undefined
    ? pointer
    : appendPointer(ROOT_POINTER, [COMPONENTS_KEY, group, renamed, ...rest]);
}

function renamedText(text: string, renames: Renames): string {
  const pairs = [...renames.values()].flatMap((group) => [...group]);
  // The longest old name first, so a name that starts another one does not split it.
  pairs.sort(([a], [b]) => b.length - a.length);
  return pairs.reduce((shown, [old, renamed]) => shown.replaceAll(old, renamed), text);
}

function rewriteRefs(document: unknown, renaming: ComponentRenaming): void {
  for (const { node } of findRefHolders(document)) {
    node.$ref = renaming.pointer(node.$ref);
  }
  for (const mapping of findMappings(document)) {
    for (const [name, value] of Object.entries(mapping)) {
      if (typeof value === "string") {
        mapping[name] = renaming.pointer(value);
      }
    }
  }
}

/**
 * Rename, in place, the components the bundle named after a URL with a query, and every local
 * `$ref` and `mapping` value that names them. `documents` are the documents the load read.
 */
export function renameQueryNamedComponents(
  bundled: unknown,
  keysBefore: ComponentKeys,
  documents: readonly LoadedDocument[],
): ComponentRenaming {
  const documentNames = queryDocumentNames(documents);
  const renames: Renames = new Map();
  if (documentNames.size > 0) {
    for (const [group, entries] of Object.entries(componentsOf(bundled))) {
      const groupRenames = renameGroup(entries, keysBefore.get(group) ?? new Set(), documentNames);
      if (groupRenames.size > 0) {
        renames.set(group, groupRenames);
      }
    }
  }
  const renaming: ComponentRenaming = {
    pointer: (pointer) => renamedPointer(pointer, renames),
    text: (text) => renamedText(text, renames),
    isResolvedCollision: (message) => resolvesCollision(message, renames),
  };
  if (renames.size > 0) {
    rewriteRefs(bundled, renaming);
  }
  return renaming;
}
