import {
  appendPointer,
  canonicalRef,
  parseRefPointer,
  ROOT_POINTER,
} from "../../domain/openapi/json-pointer.js";
import { findMappings, findRefHolders } from "./ref-holders.js";

/**
 * Redocly 1.x bundles an external `$ref` into a component named after the last segment of the
 * document's URL, without its extension, when the pointer gives no free name (a `$ref` to a whole
 * document, or two targets with the same pointer). The query stays in that name, and a query holds
 * API keys and signatures, so `https://host/schemas/pet?token=…` became the component
 * `pet?token=…` in the generated file and in messages (threat model T4b). This renames such a
 * component after the URL without its query: `pet`, with a `-2` suffix when that name is taken.
 */

type Components = Record<string, Record<string, unknown>>;

/** The keys of each `components` group before bundling: the bundle edits the document in place. */
export type ComponentKeys = ReadonlyMap<string, ReadonlySet<string>>;

/** Old and new name of each renamed component, per `components` group. */
type Renames = Map<string, Map<string, string>>;

const COMPONENTS_KEY = "components";
const REMOTE_URL_RE = /^https?:\/\//;
const PATH_SEPARATOR_RE = /[/\\]/;
const EXTENSION_RE = /\.[^.]+$/;
/** What Redocly puts between the base name and the rest of a component name. */
const NAME_SUFFIX_STARTS = ["_", "-"];
const FIRST_SERIAL = 2;

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

/** The base name Redocly 1.34 gives a document (`refBaseName`): the last segment, no extension. */
function redoclyBaseName(ref: string): string {
  return (ref.split(PATH_SEPARATOR_RE).at(-1) ?? "").replace(EXTENSION_RE, "");
}

/**
 * The base name of the URL without its query and fragment. A URL with no last segment
 * (`https://host/?key=…`) is named after its host, so the name is never empty.
 */
function queryFreeBaseName(url: URL): string {
  const withoutQuery = new URL(url.pathname, url.origin).href;
  return redoclyBaseName(withoutQuery) || url.hostname;
}

/** Each base name Redocly takes from a remote URL with a query, with the name to use instead. */
function queryBaseNames(documentRefs: Iterable<string>): Map<string, string> {
  const names = new Map<string, string>();
  for (const ref of documentRefs) {
    const url = REMOTE_URL_RE.test(ref) && URL.canParse(ref) ? new URL(ref) : undefined;
    if (url === undefined || url.search === "") {
      continue;
    }
    const named = redoclyBaseName(ref);
    const clean = queryFreeBaseName(url);
    if (named !== clean) {
      names.set(named, clean);
    }
  }
  return names;
}

/** The name `key` gets, or undefined when no query base name starts it. */
function queryFreeName(key: string, baseNames: ReadonlyMap<string, string>): string | undefined {
  // The longest base name first: `pet?a=1` must not match as `pet?a` when both were loaded.
  const matches = [...baseNames.keys()].filter(
    (named) =>
      key === named || NAME_SUFFIX_STARTS.some((start) => key.startsWith(`${named}${start}`)),
  );
  const named = matches.sort((a, b) => b.length - a.length)[0];
  return named === undefined ? undefined : `${baseNames.get(named)}${key.slice(named.length)}`;
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
  baseNames: ReadonlyMap<string, string>,
): Map<string, string> {
  const renames = new Map<string, string>();
  const taken = new Set(Object.keys(entries));
  for (const key of Object.keys(entries)) {
    const name = keysBefore.has(key) ? undefined : queryFreeName(key, baseNames);
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
 * `$ref` and `mapping` value that names them. `documentRefs` are the refs of the loaded documents.
 */
export function renameQueryNamedComponents(
  bundled: unknown,
  keysBefore: ComponentKeys,
  documentRefs: Iterable<string>,
): ComponentRenaming {
  const baseNames = queryBaseNames(documentRefs);
  const renames: Renames = new Map();
  if (baseNames.size > 0) {
    for (const [group, entries] of Object.entries(componentsOf(bundled))) {
      const groupRenames = renameGroup(entries, keysBefore.get(group) ?? new Set(), baseNames);
      if (groupRenames.size > 0) {
        renames.set(group, groupRenames);
      }
    }
  }
  const renaming: ComponentRenaming = {
    pointer: (pointer) => renamedPointer(pointer, renames),
    text: (text) => renamedText(text, renames),
  };
  if (renames.size > 0) {
    rewriteRefs(bundled, renaming);
  }
  return renaming;
}
