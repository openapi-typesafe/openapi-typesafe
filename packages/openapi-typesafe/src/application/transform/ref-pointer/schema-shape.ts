import { isJsonObject, type JsonObject } from "./located-node.js";

/**
 * Which kind of type the generator writes for a schema, as the `$ref` pointer walk reads it
 * (ADR-026): an object, an array, or a schema whose object keywords `objectType` types.
 */

function typeNames(node: JsonObject): readonly unknown[] {
  return Array.isArray(node.type) ? node.type : [node.type];
}

/**
 * Whether the generated type is an object. One `type` name decides alone: `type: string` with
 * `properties` or `items` is `string`, as `coreType` matches the `type` before the keywords.
 */
export function isObjectShape(node: JsonObject): boolean {
  if (typeof node.type === "string") {
    return node.type === "object";
  }
  return (
    typeNames(node).includes("object") ||
    "properties" in node ||
    "additionalProperties" in node ||
    "patternProperties" in node
  );
}

/** Whether the generated type is an array; one `type` name decides alone (`isObjectShape`). */
export function isArrayShape(node: JsonObject): boolean {
  if (typeof node.type === "string") {
    return node.type === "array";
  }
  return typeNames(node).includes("array") || "items" in node;
}

/** Whether `objectType` writes a type for the schema; the same test as there. */
export function hasObjectKeywords(node: JsonObject): boolean {
  const hasProperties = isJsonObject(node.properties) && Object.keys(node.properties).length > 0;
  return (
    hasProperties || Boolean(node.additionalProperties || node.patternProperties || node.$defs)
  );
}

/** Whether the schema has `allOf`, `anyOf` or `oneOf`. */
export function isComposed(node: JsonObject): boolean {
  return "allOf" in node || "anyOf" in node || "oneOf" in node;
}
