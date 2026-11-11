import type { Schema } from "../../../domain/openapi/schema-object.js";
import { propertyAccessFlags } from "../schema/access-flags.js";
import { isInputLocation } from "../schema/input-location.js";
import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import {
  followLocated,
  followRefs,
  isJsonObject,
  type JsonObject,
  type LocatedNode,
} from "./located-node.js";

/**
 * What the generated type of an object schema makes of one of its properties: optional, left
 * out, wrapped in a read or write marker, or a value that may be `undefined` or `null`.
 */

/** `nullable: true` or a `type` list with `null`: the generated type includes `null`. */
export function isNullableSchema(node: unknown): boolean {
  if (!isJsonObject(node)) {
    return false;
  }
  return node.nullable === true || (Array.isArray(node.type) && node.type.includes("null"));
}

/**
 * Whether the generated type has the property as optional, as `objectType` decides: a `default`
 * makes a property required except in an input location, where the client may leave it out.
 */
export function isOptionalProperty(
  owner: LocatedNode & { node: JsonObject },
  key: string,
  options: SchemaOptions,
): boolean {
  const { node } = owner;
  const required = Array.isArray(node.required) ? node.required : undefined;
  const property = (node.properties as JsonObject)[key];
  const hasDefault = isJsonObject(property) && property.default !== undefined;
  const isDefaultRequired =
    hasDefault && options.defaultNonNullable && !isInputLocation(owner.location, options.fixes);
  const isRequired =
    required?.includes(key) === true ||
    (required === undefined && options.propertiesRequiredByDefault) ||
    isDefaultRequired;
  return !isRequired;
}

/**
 * Whether `--exclude-deprecated` leaves the property out: its object, or the one its `$ref`
 * names, is deprecated (`objectType`). The key is then not in the generated type at all.
 */
export function isExcludedProperty(
  property: unknown,
  options: SchemaOptions,
  refs: RefResolver,
): boolean {
  const resolved = followRefs(property, refs);
  return options.excludeDeprecated && isJsonObject(resolved) && Boolean(resolved.deprecated);
}

/**
 * Whether the generated type keeps one of the schema's properties. The index signature next to
 * them then holds their types too (`withPropertyTypes`), so it is not its value schema's type.
 */
export function hasKeptProperties(node: JsonObject, options: SchemaOptions, refs: RefResolver) {
  const properties = isJsonObject(node.properties) ? node.properties : {};
  return Object.values(properties).some((value) => !isExcludedProperty(value, options, refs));
}

const COMPOSITION_KEYWORDS = ["allOf", "anyOf", "oneOf"] as const;

/**
 * Whether the owner's index signature surely holds more than its `additionalProperties` type: the
 * types of the properties it keeps (`withPropertyTypes`) or of its `patternProperties`. It reads
 * the document, not the types, so a property type the signature admits already counts too
 * (ADR-026, 2026-11-10, point 2).
 */
export function isWidenedIndex(owner: JsonObject, options: SchemaOptions, refs: RefResolver) {
  const patterns = owner.patternProperties;
  const hasPatterns = isJsonObject(patterns) && Object.keys(patterns).length > 0;
  return hasPatterns || hasKeptProperties(owner, options, refs);
}

/**
 * Whether `[string]` of the owner's type is its `additionalProperties` type alone: its index
 * signature holds nothing else, and no `allOf` / `anyOf` / `oneOf` is next to it, whose members
 * may add an index signature or an inherited discriminator.
 */
export function isIndexedByValue(owner: unknown, options: SchemaOptions, refs: RefResolver) {
  if (!isJsonObject(owner)) {
    return true;
  }
  const isComposed = COMPOSITION_KEYWORDS.some((keyword) => keyword in owner);
  return !isComposed && !isWidenedIndex(owner, options, refs);
}

const UNEVALUATED_PROPERTIES = "unevaluatedProperties";

/**
 * Whether the owner's index signature surely holds more than the record value under `keyword`.
 * The `unevaluated-properties` fix also puts the declared property types of the owner's
 * `allOf` / `anyOf` / `oneOf` members in its signature, so next to those it is widened too.
 */
export function isWidenedRecordValue(
  owner: unknown,
  keyword: string,
  options: SchemaOptions,
  refs: RefResolver,
): boolean {
  if (!isJsonObject(owner)) {
    return false;
  }
  return keyword === UNEVALUATED_PROPERTIES
    ? !isIndexedByValue(owner, options, refs)
    : isWidenedIndex(owner, options, refs);
}

/**
 * Whether `--read-write-markers` wraps the type of a property or `$defs` member: one that is only
 * `readOnly` or only `writeOnly` is `$Read<T>` or `$Write<T>` (object-type.ts).
 */
export function isMarkedProperty(value: unknown, options: SchemaOptions, refs: RefResolver) {
  if (!options.readWriteMarkers || !isJsonObject(value)) {
    return false;
  }
  const flags = propertyAccessFlags(value as Schema, { options, refs });
  return flags.isReadOnly !== flags.isWriteOnly;
}

/** Whether a value is there: `present`, `absent` (may be `undefined` or `null`) or `unknown`. */
export type Presence = "present" | "absent" | "unknown";

/** The presence of a value of `schema` itself: `absent` when its type includes `null`. */
export function schemaPresence(schema: unknown, refs: RefResolver): Presence {
  return isNullableSchema(followRefs(schema, refs)) ? "absent" : "present";
}

/** The presence of property `key` of `schema`: optional or nullable is `absent`. */
export function propertyPresence(
  schema: LocatedNode,
  key: string,
  options: SchemaOptions,
  refs: RefResolver,
): Presence {
  const owner = followLocated(schema, refs);
  const { node } = owner;
  const properties = isJsonObject(node) && isJsonObject(node.properties) ? node.properties : {};
  if (!isJsonObject(node) || !Object.hasOwn(properties, key)) {
    return "unknown";
  }
  return isOptionalProperty({ ...owner, node }, key, options)
    ? "absent"
    : schemaPresence(properties[key], refs);
}
