import { isRawBinarySchema } from "../../../domain/openapi/binary-content.js";
import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";

/**
 * What the generated type of a schema has under a key, read from the schema itself. It answers the
 * question TypeScript answers when it checks `T["key"]`, for the schema shapes where the answer is
 * sure; for every other shape it says `opaque`, so a caller never assumes an error that is not.
 */

export type GeneratedMember =
  | { readonly kind: "property"; readonly node: unknown; readonly isOptional: boolean }
  /** An index signature; `node` is undefined when its value type is `unknown`. */
  | { readonly kind: "index"; readonly node: unknown }
  | { readonly kind: "missing" }
  | { readonly kind: "opaque" };

type JsonObject = Readonly<Record<string, unknown>>;

const OPAQUE_KEYS = ["not", "enum", "const", "$ref"] as const;
/** How deep `allOf`/`anyOf`/`oneOf` members are read; deeper shapes count as opaque. */
const MAX_DEPTH = 8;
const INDEX_RE = /^\d+$/;
const MISSING: GeneratedMember = { kind: "missing" };
const OPAQUE: GeneratedMember = { kind: "opaque" };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The schema a node stands for: a `$ref` is followed to its target. */
export function followRefs(node: unknown, refs: RefResolver): unknown {
  return isJsonObject(node) && typeof node.$ref === "string" ? refs.resolve(node.$ref) : node;
}

/** `nullable: true` or a `type` list with `null`: the generated type includes `null`. */
export function isNullableSchema(node: unknown): boolean {
  if (!isJsonObject(node)) {
    return false;
  }
  return node.nullable === true || (Array.isArray(node.type) && node.type.includes("null"));
}

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
function hasObjectKeywords(node: JsonObject): boolean {
  const hasProperties = isJsonObject(node.properties) && Object.keys(node.properties).length > 0;
  return (
    hasProperties || Boolean(node.additionalProperties || node.patternProperties || node.$defs)
  );
}

/**
 * A key of an object schema without object keywords. With a `type` it is `Record<string, never>`:
 * every key is `never`, and so is every key after it (or `unknown` with `--empty-objects-unknown`,
 * which has no key). Without a `type` it is `unknown`.
 */
function emptyObjectMember(node: JsonObject, options: SchemaOptions): GeneratedMember {
  return node.type !== undefined && !options.emptyObjectsUnknown ? OPAQUE : MISSING;
}

/** Whether a key the object has no property for is still a member: `toString`, `length`, `0`. */
function isBuiltInMember(key: string, prototype: object): boolean {
  return key in prototype;
}

function indexMember(node: JsonObject, options: SchemaOptions): GeneratedMember | null {
  const { additionalProperties: values, patternProperties: patterns } = node;
  if (isJsonObject(patterns) && Object.keys(patterns).length > 0) {
    return OPAQUE;
  }
  if (isJsonObject(values) && Object.keys(values).length > 0) {
    return { kind: "index", node: values };
  }
  const isImplicit = values === true || (isJsonObject(values) && Object.keys(values).length === 0);
  return isImplicit || (!values && options.additionalProperties)
    ? { kind: "index", node: undefined }
    : null;
}

function isOptionalProperty(node: JsonObject, key: string, options: SchemaOptions): boolean {
  const required = Array.isArray(node.required) ? node.required : undefined;
  const property = (node.properties as JsonObject)[key];
  const hasDefault = isJsonObject(property) && property.default !== undefined;
  const isRequired =
    required?.includes(key) === true ||
    (required === undefined && options.propertiesRequiredByDefault) ||
    (hasDefault && options.defaultNonNullable);
  return !isRequired;
}

function objectMember(node: JsonObject, key: string, options: SchemaOptions): GeneratedMember {
  const properties = isJsonObject(node.properties) ? node.properties : {};
  if (Object.hasOwn(properties, key)) {
    const property = properties[key];
    const isExcluded = options.excludeDeprecated && isJsonObject(property) && property.deprecated;
    return isExcluded || isJsonObject(node.discriminator)
      ? OPAQUE
      : { kind: "property", node: property, isOptional: isOptionalProperty(node, key, options) };
  }
  // `unevaluatedProperties` adds an index signature with its fix, so it counts as opaque too.
  const isUnknownShape =
    isJsonObject(node.discriminator) || node.unevaluatedProperties !== undefined;
  if (isBuiltInMember(key, {}) || key === "$defs" || isUnknownShape) {
    return OPAQUE;
  }
  return hasObjectKeywords(node)
    ? (indexMember(node, options) ?? MISSING)
    : emptyObjectMember(node, options);
}

/** Whether a value is there: `present`, `absent` (may be `undefined` or `null`) or `unknown`. */
export type Presence = "present" | "absent" | "unknown";

/** The presence of a value of `schema` itself: `absent` when its type includes `null`. */
export function schemaPresence(schema: unknown, refs: RefResolver): Presence {
  return isNullableSchema(followRefs(schema, refs)) ? "absent" : "present";
}

/** The presence of property `key` of `schema`: optional or nullable is `absent`. */
export function propertyPresence(
  schema: unknown,
  key: string,
  options: SchemaOptions,
  refs: RefResolver,
): Presence {
  const node = followRefs(schema, refs);
  const properties = isJsonObject(node) && isJsonObject(node.properties) ? node.properties : {};
  if (!isJsonObject(node) || !Object.hasOwn(properties, key)) {
    return "unknown";
  }
  return isOptionalProperty(node, key, options) ? "absent" : schemaPresence(properties[key], refs);
}

function membersOf(node: JsonObject, keyword: string): readonly unknown[] {
  const members = node[keyword];
  return Array.isArray(members) ? members : [];
}

function withoutComposition(node: JsonObject): JsonObject {
  const { allOf: _allOf, anyOf: _anyOf, oneOf: _oneOf, ...own } = node;
  return own;
}

/** Own keywords without an object type of their own (`properties: {}`) add no part. */
function hasOwnObjectType(own: JsonObject): boolean {
  return isObjectShape(own) && (hasObjectKeywords(own) || isJsonObject(own.discriminator));
}

/**
 * `allOf` with own keywords is an intersection (`intersectionMember`).
 * `anyOf` or `oneOf` alone is a union: a key is missing if one member misses it. A mix of both
 * is written in more than one way (`anyof-properties`), so it counts as opaque.
 */
function composedMember(node: JsonObject, key: string, input: MemberInput): GeneratedMember {
  const variants = [...membersOf(node, "anyOf"), ...membersOf(node, "oneOf")];
  const own = withoutComposition(node);
  const hasOwn = hasOwnObjectType(own);
  if (variants.length > 0) {
    const isAlone = membersOf(node, "allOf").length === 0 && !hasOwn;
    const members = variants.map((variant) => memberAt(variant, key, input));
    return isAlone && members.some((member) => member.kind === "missing") ? MISSING : OPAQUE;
  }
  const parts = [...membersOf(node, "allOf"), ...(hasOwn ? [own] : [])];
  return intersectionMember(parts.map((part) => memberAt(part, key, input)));
}

function isUnknownIndex(member: GeneratedMember): boolean {
  return member.kind === "index" && member.node === undefined;
}

/**
 * A key of an intersection: missing if every part misses it; the part's member if only one part
 * has it (`A & B` where `B` has no such key and no index signature); else opaque. A part's
 * `[key: string]: unknown` adds nothing (`unknown & T` is `T`), and only such parts give `unknown`.
 */
function intersectionMember(members: readonly GeneratedMember[]): GeneratedMember {
  const found = members.filter((member) => member.kind !== "missing");
  const typed = found.filter((member) => !isUnknownIndex(member));
  const [only] = typed;
  if (only === undefined) {
    return found[0] ?? MISSING;
  }
  return typed.length === 1 && only.kind !== "opaque" ? only : OPAQUE;
}

interface MemberInput {
  readonly options: SchemaOptions;
  readonly refs: RefResolver;
  readonly depth: number;
}

function memberAt(schema: unknown, key: string, input: MemberInput): GeneratedMember {
  const node = followRefs(schema, input.refs);
  if (!isJsonObject(node) || OPAQUE_KEYS.some((name) => name in node) || input.depth > MAX_DEPTH) {
    return OPAQUE;
  }
  if (isNullableSchema(node)) {
    // Every key of `T | null` is an error, unless `T` is unknown (then the type is `unknown`).
    return isObjectShape(node) || isArrayShape(node) ? MISSING : OPAQUE;
  }
  if (input.options.readWriteMarkers) {
    return OPAQUE;
  }
  if ("allOf" in node || "anyOf" in node || "oneOf" in node) {
    return composedMember(node, key, { ...input, depth: input.depth + 1 });
  }
  if (isObjectShape(node)) {
    return objectMember(node, key, input.options);
  }
  if (isArrayShape(node)) {
    return INDEX_RE.test(key) || isBuiltInMember(key, []) ? OPAQUE : MISSING;
  }
  // `--binary-as-blob` types raw binary strings as `Blob`, which has members of its own.
  return input.options.binaryAsBlob && isRawBinarySchema(node as never)
    ? OPAQUE
    : primitiveMember(node, key);
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
function primitiveMember(node: JsonObject, key: string): GeneratedMember {
  if (node.type === undefined) {
    return hasObjectKeywords(node) ? OPAQUE : MISSING;
  }
  const prototype = typeof node.type === "string" ? PRIMITIVE_PROTOTYPES[node.type] : undefined;
  return prototype !== undefined && !isBuiltInMember(key, prototype) ? MISSING : OPAQUE;
}

/** The member `key` of the type generated for `schema` (a `$ref` is followed first). */
export function generatedMember(
  schema: unknown,
  key: string,
  options: SchemaOptions,
  refs: RefResolver,
): GeneratedMember {
  return memberAt(schema, key, { options, refs, depth: 0 });
}
