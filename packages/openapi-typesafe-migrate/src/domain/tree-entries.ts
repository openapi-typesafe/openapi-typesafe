import {
  type TreeList,
  type TreeMap,
  type TreeNode,
  type TreeScalar,
  textEntries,
} from "./config-documents.js";
import type { NameEntry, SpecEntry } from "./dependency-map.js";
import type { TextEdit } from "./text-edits.js";

/**
 * The tree side of domain/dependency-map.ts: the entries of parsed maps and lists, with the edits
 * that replace their keys and values in place (domain/config-documents.ts).
 */

/** A scalar that a whole new value can replace. */
type EditableScalar = TreeScalar & { readonly encode: (value: string) => string };

const isEditable = (node: TreeNode): node is EditableScalar =>
  node.kind === "scalar" && node.encode !== undefined;

/** The edit that writes `value` where `scalar` is. */
export const replaceScalar = (scalar: EditableScalar, value: string): TextEdit => ({
  start: scalar.start,
  end: scalar.end,
  text: scalar.encode(value),
});

/**
 * The `name: spec` entries of a dependency map, catalog or import map. A key the tool cannot
 * replace is left out; a value it cannot replace gives an entry without a spec.
 */
export function specEntries(map: TreeMap): SpecEntry[] {
  return textEntries(map).flatMap(({ key, value }): SpecEntry[] => {
    if (!isEditable(key)) {
      return [];
    }
    const spec = isEditable(value)
      ? { value: value.value, replace: (to: string) => replaceScalar(value, to) }
      : undefined;
    return [{ name: key.value, spec, renameKey: (name) => replaceScalar(key, name) }];
  });
}

/** The keys of `map` that the tool can replace, as names. */
export function keyEntries(map: TreeMap): NameEntry[] {
  return textEntries(map)
    .map(({ key }) => key)
    .filter(isEditable)
    .map((key) => ({ name: key.value, rename: (name) => replaceScalar(key, name) }));
}

/** The text items of `list` that the tool can replace, as names. */
export function itemEntries(list: TreeList): NameEntry[] {
  return list.items
    .filter(isEditable)
    .map((item) => ({ name: item.value, rename: (name) => replaceScalar(item, name) }));
}

/**
 * The keys of `node` and of the maps in it, at any depth, in order. Override fields name
 * packages by their keys (domain/override-targets.ts).
 */
export function nestedKeys(node: TreeNode): string[] {
  if (node.kind !== "map") {
    return [];
  }
  return textEntries(node).flatMap(({ key, value }) => [key.value, ...nestedKeys(value)]);
}
