import { parseRefPointer } from "./json-pointer.js";

/**
 * The values a schema admits when it admits only finitely many (`enum`, `const`, and `allOf` /
 * `anyOf` / `oneOf` of those), read from the document. Null means "any value" as far as this
 * reading goes: a schema of any other shape, or a `$ref` it cannot follow, is never assumed to
 * exclude a value.
 */

export type AdmittedValue = string | number | boolean | null;
/** A finite set of values, or null for every value. */
export type AdmittedValues = ReadonlySet<AdmittedValue> | null;

type JsonObject = Readonly<Record<string, unknown>>;

/** How deep `$ref`s and compositions are followed; deeper schemas admit every value. */
const MAX_DEPTH = 16;
const LOCAL_REF_PREFIX = "#/";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The node at a local `$ref` (`#/...`) of the document, or undefined. */
export function resolveLocalRef(document: unknown, ref: string): unknown {
  if (!ref.startsWith(LOCAL_REF_PREFIX)) {
    return undefined;
  }
  let node: unknown = document;
  for (const segment of parseRefPointer(ref)) {
    node = isObject(node) || Array.isArray(node) ? (node as JsonObject)[segment] : undefined;
  }
  return node;
}

function intersect(left: AdmittedValues, right: AdmittedValues): AdmittedValues {
  if (left === null || right === null) {
    return left ?? right;
  }
  return new Set([...left].filter((value) => right.has(value)));
}

function unite(sets: readonly AdmittedValues[]): AdmittedValues {
  return sets.some((set) => set === null) ? null : new Set(sets.flatMap((set) => [...(set ?? [])]));
}

function isAdmittedValue(value: unknown): value is AdmittedValue {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

interface Walk {
  readonly document: unknown;
  readonly depth: number;
  /** `$ref`s whose targets are left out: they add nothing to the generated type here. */
  readonly skipped: ReadonlySet<string>;
}

function follow(node: unknown, walk: Walk): unknown {
  if (!isObject(node) || typeof node.$ref !== "string") {
    return node;
  }
  return walk.skipped.has(node.$ref) ? undefined : resolveLocalRef(walk.document, node.$ref);
}

function members(node: JsonObject, keyword: string): readonly unknown[] {
  const list = node[keyword];
  return Array.isArray(list) ? list : [];
}

/** `enum` and `const` of the schema itself, before its compositions. */
function ownValues(node: JsonObject): AdmittedValues {
  const listed = Array.isArray(node.enum) ? node.enum.filter(isAdmittedValue) : null;
  const constant = "const" in node && isAdmittedValue(node.const) ? new Set([node.const]) : null;
  return intersect(listed === null ? null : new Set(listed), constant);
}

function schemaValues(schema: unknown, walk: Walk): AdmittedValues {
  const node = follow(schema, walk);
  if (!isObject(node) || walk.depth > MAX_DEPTH) {
    return null;
  }
  const next = { ...walk, depth: walk.depth + 1 };
  const parts = members(node, "allOf").map((part) => schemaValues(part, next));
  const variants = [...members(node, "anyOf"), ...members(node, "oneOf")];
  const union = variants.length === 0 ? null : unite(variants.map((v) => schemaValues(v, next)));
  return [...parts, union].reduce<AdmittedValues>(intersect, ownValues(node));
}

function propertyValues(schema: unknown, key: string, walk: Walk): AdmittedValues {
  const node = follow(schema, walk);
  if (!isObject(node) || walk.depth > MAX_DEPTH) {
    return null;
  }
  const next = { ...walk, depth: walk.depth + 1 };
  const properties = isObject(node.properties) ? node.properties : {};
  const own = Object.hasOwn(properties, key) ? schemaValues(properties[key], next) : null;
  const parts = members(node, "allOf").map((part) => propertyValues(part, key, next));
  return parts.reduce<AdmittedValues>(intersect, own);
}

/**
 * The values property `key` of an object schema admits: the intersection over the schema's own
 * `properties` and its `allOf` parts (followed through `$ref`s, except `skipped` ones); null for
 * every value.
 */
export function admittedPropertyValues(
  schema: unknown,
  key: string,
  document: unknown,
  skipped: ReadonlySet<string> = new Set(),
): AdmittedValues {
  return propertyValues(schema, key, { document, depth: 0, skipped });
}
