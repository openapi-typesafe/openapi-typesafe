import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { enumRule } from "../schema/enum-rule.js";
import { type GeneratedMember, MISSING, NEVER_VALUES, OPAQUE } from "./generated-member.js";
import { childLocation, isJsonObject, type JsonObject, type LocatedNode } from "./located-node.js";
import { hasObjectKeywords } from "./schema-shape.js";

/**
 * The members of the literal, array and primitive types the generator writes, as the `$ref`
 * pointer walk reads them (ADR-026): built-in members are opaque, other keys missing.
 */

const INDEX_RE = /^\d+$/;

/** Whether a key the object has no property for is still a member: `toString`, `length`, `0`. */
export function isBuiltInMember(key: string, prototype: object): boolean {
  return key in prototype;
}

/**
 * The values of the literal type the generator writes for a `const` or for an `enum` its enum
 * rule types (`SHAPE_RULES`: a union of the values, or a TypeScript enum of them, whose members
 * have the members of their primitive); null for any other schema. `not` is not typed, so a
 * schema with it is read by its other keywords.
 */
export function literalValuesOf(node: JsonObject): readonly unknown[] | null {
  if (node.const !== undefined) {
    return [node.const];
  }
  return enumRule.matches(node as SchemaObject) ? (node.enum as readonly unknown[]) : null;
}

/** The value whose members a primitive literal has: `"a".length`; undefined for an object. */
function literalPrototypeOf(value: unknown): object | undefined {
  switch (typeof value) {
    case "string":
      return String.prototype;
    case "number":
      return Number.prototype;
    case "boolean":
      return Boolean.prototype;
    default:
      return undefined;
  }
}

/**
 * A key of a literal type: missing where one of its primitive values has no such member (the
 * `oneOf` of `"red" | "green"`). A `null` value is left out: the `nullable-enums` fix may drop it.
 * An object or array literal is opaque. Without values the type is `never`, whose every key is
 * `never` too, or with `--enum` an enum without members, which has no key; `null` alone has none.
 */
export function literalMember(
  values: readonly unknown[],
  key: string,
  isTypeScriptEnum: boolean,
): GeneratedMember {
  if (values.length === 0) {
    return isTypeScriptEnum ? MISSING : NEVER_VALUES;
  }
  if (values.every((value) => value === null)) {
    return MISSING;
  }
  const prototypes = values.filter((value) => value !== null).map(literalPrototypeOf);
  if (prototypes.some((prototype) => prototype === undefined)) {
    return OPAQUE;
  }
  const isMissingKey = prototypes.some((prototype) => !isBuiltInMember(key, prototype as object));
  return isMissingKey ? MISSING : OPAQUE;
}

/**
 * A key of an array schema. A position of an array of `items` (`X[]["0"]`) is an item, as
 * `[number]` reads it; one of a tuple (`prefixItems`, an `items` list) is opaque, as with
 * `--array-length` a position past its end has no element. A built-in member (`length`) is
 * opaque, any other key missing.
 */
export function arrayMember(
  owner: LocatedNode & { node: JsonObject },
  key: string,
): GeneratedMember {
  if (!INDEX_RE.test(key)) {
    return isBuiltInMember(key, []) ? OPAQUE : MISSING;
  }
  const { items, prefixItems } = owner.node;
  const isTuple = (Array.isArray(prefixItems) && prefixItems.length > 0) || Array.isArray(items);
  if (isTuple) {
    return OPAQUE;
  }
  if (isJsonObject(items)) {
    const location = childLocation(owner.location, "items");
    return { kind: "index", node: items, location, isOtherType: false };
  }
  // No `items` (or `true`) is `unknown[]`, whose items are `unknown`.
  return items === undefined || items === true
    ? { kind: "index", node: undefined, location: undefined, isOtherType: false }
    : OPAQUE;
}

/** The JavaScript value whose members a primitive `type` has: `"".length`, `(0).toFixed`. */
const PRIMITIVE_PROTOTYPES: Readonly<Record<string, object>> = {
  string: String.prototype,
  number: Number.prototype,
  integer: Number.prototype,
  boolean: Boolean.prototype,
};

/**
 * A key of a schema with one primitive `type`: missing unless the primitive has it. Object and
 * array keywords next to that `type` do not change the type (`isObjectShape`). Without a `type`
 * and object keywords the schema is `unknown` (`objectType` writes nothing), which has no keys.
 */
export function primitiveMember(node: JsonObject, key: string): GeneratedMember {
  if (node.type === undefined) {
    return hasObjectKeywords(node) ? OPAQUE : MISSING;
  }
  const prototype = typeof node.type === "string" ? PRIMITIVE_PROTOTYPES[node.type] : undefined;
  return prototype !== undefined && !isBuiltInMember(key, prototype) ? MISSING : OPAQUE;
}
