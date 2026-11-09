import { columnAt, type FileMigration, lineAt, unchanged } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";

/**
 * A JSON, JSONC or YAML config as a parser adapter reads it: a tree per document with the offsets
 * of its nodes in the text, so a migration replaces one key, value or word and keeps the rest of
 * the file byte for byte (comments, formatting, number literals, key order, duplicate keys).
 * Migrations that look for values by key path read the string values of the tree.
 */

interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * A text value: a JSON string, a YAML scalar. `start` and `end` cover the node with its quotes;
 * `content` covers its text as written: inside the quotes, and the content lines of a block
 * scalar without its `|` or `>` line. A YAML plain scalar that YAML reads as a number or a
 * boolean has its text as written as `value` (`1.10`, not 1.1).
 */
export interface TreeScalar extends Span {
  readonly kind: "scalar";
  readonly value: string;
  readonly content: Span;
  /** Line breaks fold to spaces in every YAML scalar but a literal block scalar (`|`). */
  readonly isFolded: boolean;
  /**
   * Writes a new value as the format needs it at this place, in the quoting of the old one when
   * that quoting can hold it. Undefined where a whole new value could change other places or the
   * type: a YAML block scalar, an anchored or a tagged scalar.
   */
  readonly encode: ((value: string) => string) | undefined;
}

export interface TreeEntry {
  readonly key: TreeNode;
  readonly value: TreeNode;
}

/** A JSON object or YAML mapping, every entry as written, duplicate keys included, in order. */
export interface TreeMap extends Span {
  readonly kind: "map";
  readonly entries: readonly TreeEntry[];
}

export interface TreeList extends Span {
  readonly kind: "list";
  readonly items: readonly TreeNode[];
}

/** A number, boolean or null in JSON, a YAML alias, an empty value. */
export interface TreeOther extends Span {
  readonly kind: "other";
}

export type TreeNode = TreeMap | TreeList | TreeScalar | TreeOther;

/**
 * The documents of a config (a YAML stream can hold several), or where the text stops being
 * valid. `offset` is undefined when the parser gives no place (it gave up on nesting deeper than
 * it can follow).
 */
export type DocumentRead =
  | { readonly kind: "read"; readonly documents: readonly TreeNode[] }
  | { readonly kind: "unreadable"; readonly offset: number | undefined };

/** A key path: mapping keys and list indexes, from the root of the document. */
export type DocumentPath = readonly (string | number)[];

/** A string value of a document with its key path. */
export interface DocumentString extends TreeScalar {
  readonly path: DocumentPath;
}

export const isMap = (node: TreeNode | undefined): node is TreeMap => node?.kind === "map";

export const isScalar = (node: TreeNode): node is TreeScalar => node.kind === "scalar";

/** The entries of `map` with a text key, as key and value. */
export function textEntries(map: TreeMap): { key: TreeScalar; value: TreeNode }[] {
  return map.entries.flatMap(({ key, value }) => (isScalar(key) ? [{ key, value }] : []));
}

/** The values of the entries of `map` whose key is `key`, in order. */
export function valuesAt(map: TreeMap, key: string): TreeNode[] {
  return textEntries(map)
    .filter((entry) => entry.key.value === key)
    .map((entry) => entry.value);
}

/** The maps at `key` of `map`, all of them if the key is there more than once. */
export function mapsAt(map: TreeMap, key: string): TreeMap[] {
  return valuesAt(map, key).filter(isMap);
}

/** The string values below `node` in document order; none below a key that is not text. */
function stringsBelow(node: TreeNode, path: DocumentPath): DocumentString[] {
  switch (node.kind) {
    case "scalar":
      return [{ ...node, path }];
    case "list":
      return node.items.flatMap((item, index) => stringsBelow(item, [...path, index]));
    case "map":
      return textEntries(node).flatMap(({ key, value }) =>
        stringsBelow(value, [...path, key.value]),
      );
    default:
      return [];
  }
}

/** Every string value of the documents (not the keys), with its key path, in document order. */
export function documentStrings(documents: readonly TreeNode[]): DocumentString[] {
  return documents.flatMap((document) => stringsBelow(document, []));
}

/**
 * The key a value belongs to: the last key of its path, past list indexes, so the items of a list
 * (also of a nested list) belong to the key that holds the list.
 */
export function ownerKey(path: DocumentPath): string | undefined {
  return path.findLast((part): part is string => typeof part === "string");
}

/**
 * The migration of a config that the parser could not read. A broken config that names no
 * original package is not this migration's concern; one that does is left to the user, with the
 * place where it stops being valid.
 */
export function unreadableConfig(text: string, offset: number | undefined): FileMigration {
  const isNamed = [...PACKAGE_RENAMES.keys()].some((name) => text.includes(name));
  if (!isNamed) {
    return unchanged(text);
  }
  const position =
    offset === undefined
      ? undefined
      : { line: lineAt(text, offset), column: columnAt(text, offset) };
  return { ...unchanged(text), manualSteps: [{ kind: "config-unreadable", position }] };
}
