import type { ContextInput } from "./parity-arbitraries.js";

/**
 * With `--enum`, the original intersected a TypeScript enum with literals of its values where an
 * `allOf` put them at one place (`Root & 0`, `"a" & RootKind`): an enum member is no literal, so
 * the type was `never`. The new generator types such a literal by the enum's member on purpose
 * (test/api/enum-intersected-values.test.ts), so these inputs differ.
 */

const ENUM_METADATA_KEYS = [
  "x-enum-varnames",
  "x-enumNames",
  "x-enum-descriptions",
  "x-enumDescriptions",
] as const;

type Node = Readonly<Record<string, unknown>>;

/** The values of a value list and whether `--enum` declares them as a TypeScript enum. */
interface ValueList {
  readonly values: readonly unknown[];
  readonly isEnum: boolean;
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnumValue(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number";
}

function valueListOf(node: Node, input: ContextInput): ValueList | null {
  if (node.const !== undefined) {
    return { values: [node.const], isEnum: false };
  }
  if (!Array.isArray(node.enum) || node.type === "object") {
    return null;
  }
  const hasMetadata = ENUM_METADATA_KEYS.some((key) => Array.isArray(node[key]));
  const isEnum = node.enum.every(isEnumValue) && (!input.flags.conditionalEnums || hasMetadata);
  return { values: node.enum, isEnum };
}

/** Every value list in a node, nested ones too. */
function valueListsIn(value: unknown, input: ContextInput): ValueList[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => valueListsIn(item, input));
  }
  if (!isNode(value)) {
    return [];
  }
  const own = valueListOf(value, input);
  const nested = Object.values(value).flatMap((item) => valueListsIn(item, input));
  return own === null ? nested : [own, ...nested];
}

function shareValue(left: ValueList, right: ValueList): boolean {
  const keys = new Set(left.values.map((value) => JSON.stringify(value)));
  return right.values.some((value) => isEnumValue(value) && keys.has(JSON.stringify(value)));
}

/** Whether some node's `allOf` holds a TypeScript enum and literals of one of its values. */
export function intersectsEnumWithLiterals(value: unknown, input: ContextInput): boolean {
  if (!input.flags.enum) {
    return false;
  }
  const lists = isNode(value) && Array.isArray(value.allOf) ? valueListsIn(value, input) : [];
  const enums = lists.filter((list) => list.isEnum);
  const literals = lists.filter((list) => !list.isEnum);
  const isIntersected = enums.some((list) => literals.some((other) => shareValue(list, other)));
  const children = isNode(value) || Array.isArray(value) ? Object.values(value) : [];
  return isIntersected || children.some((child) => intersectsEnumWithLiterals(child, input));
}

function valueKey(list: ValueList): string {
  return JSON.stringify([...new Set(list.values.map((value) => JSON.stringify(value)))].sort());
}

/** The TypeScript enums of one location: the node's own value list and its `allOf` items'. */
function locationEnums(node: Node, input: ContextInput): ValueList[] {
  const items = Array.isArray(node.allOf) ? node.allOf.filter(isNode) : [];
  const lists = [node, ...items].map((part) => valueListOf(part, input));
  return lists.filter((list): list is ValueList => list?.isEnum === true);
}

/**
 * Whether some location's `allOf` holds enums of different values under `--dedupe-enums`. The
 * original declared one enum per part and deduped each with other enums of its values; the new
 * generator declares one enum per location (TypeScript intersects the parts), so a part of fewer
 * values reads the location's enum narrowed (`never` for an empty list). Without dedupe the
 * original repeated the declaration (`hasRepeatedEnumDeclarations`).
 */
export function dedupesEnumsOfOneLocation(value: unknown, input: ContextInput): boolean {
  if (!(input.flags.enum && input.flags.dedupeEnums)) {
    return false;
  }
  const enums = isNode(value) ? locationEnums(value, input) : [];
  const isSplit = new Set(enums.map(valueKey)).size > 1;
  const children = isNode(value) || Array.isArray(value) ? Object.values(value) : [];
  return isSplit || children.some((child) => dedupesEnumsOfOneLocation(child, input));
}
