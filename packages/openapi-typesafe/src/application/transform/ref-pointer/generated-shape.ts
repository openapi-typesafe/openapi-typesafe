import { isRawBinarySchema } from "../../../domain/openapi/binary-content.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import { unevaluatedSchemaOf } from "../schema/unevaluated-schema.js";
import {
  type IndexSignatureMember,
  indexMember,
  unevaluatedIndexMember,
} from "./index-signature-member.js";
import {
  childLocation,
  followLocated,
  isJsonObject,
  type JsonObject,
  type LocatedNode,
} from "./located-node.js";
import {
  isExcludedProperty,
  isMarkedProperty,
  isNullableSchema,
  isOptionalProperty,
} from "./property-shape.js";
import { hasObjectKeywords, isArrayShape, isComposed, isObjectShape } from "./schema-shape.js";

/**
 * What the generated type of a schema has under a key, read from the schema itself. It answers the
 * question TypeScript answers when it checks `T["key"]`, for the schema shapes where the answer is
 * sure; for every other shape it says `opaque`, so a caller never assumes an error that is not.
 */

export type GeneratedMember =
  | {
      readonly kind: "property";
      readonly node: unknown;
      readonly location: string | undefined;
      readonly isOptional: boolean;
      /** `$Read<T>` or `$Write<T>` (`isMarkedProperty`): no member but the marker's own. */
      readonly isMarked: boolean;
    }
  | IndexSignatureMember
  /**
   * `$defs`, a map of names. The original indexes it through `NonNullable` (`indexKeyword`), so it
   * is present, and each definition is a member of it.
   */
  | { readonly kind: "names"; readonly names: JsonObject; readonly location: string | undefined }
  | { readonly kind: "missing" }
  | { readonly kind: "opaque" };

const OPAQUE_KEYS = ["not", "enum", "const", "$ref"] as const;
const DEFS_KEYWORD = "$defs";
const UNEVALUATED_PROPERTIES = "unevaluatedProperties";
/** How deep `allOf`/`anyOf`/`oneOf` members are read; deeper shapes count as opaque. */
const MAX_DEPTH = 8;
const INDEX_RE = /^\d+$/;
const MISSING: GeneratedMember = { kind: "missing" };
const OPAQUE: GeneratedMember = { kind: "opaque" };

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

function objectMember(
  owner: LocatedNode & { node: JsonObject },
  key: string,
  input: MemberInput,
): GeneratedMember {
  const { options } = input;
  const { node } = owner;
  const properties = isJsonObject(node.properties) ? node.properties : {};
  const isExcludedKey =
    Object.hasOwn(properties, key) && isExcludedProperty(properties[key], options, input.refs);
  // The discriminator scan may add or change the discriminator's own property, so that key is
  // opaque. Every other property is typed as written, as in an object without a discriminator.
  if (isDiscriminatorKey(node, key)) {
    return OPAQUE;
  }
  if (Object.hasOwn(properties, key) && !isExcludedKey) {
    const location = childLocation(owner.location, "properties", key);
    const isOptional = isOptionalProperty(owner, key, options);
    const isMarked = isMarkedProperty(properties[key], options, input.refs);
    return { kind: "property", node: properties[key], location, isOptional, isMarked };
  }
  if (isBuiltInMember(key, {})) {
    return OPAQUE;
  }
  const defs = node[DEFS_KEYWORD];
  if (key === DEFS_KEYWORD && isJsonObject(defs) && Object.keys(defs).length > 0) {
    return { kind: "names", names: defs, location: childLocation(owner.location, DEFS_KEYWORD) };
  }
  return hasObjectKeywords(node)
    ? (indexMember(owner, isExcludedKey, input) ?? MISSING)
    : emptyObjectMember(node, options);
}

function isDiscriminatorKey(node: JsonObject, key: string): boolean {
  const { discriminator } = node;
  return isJsonObject(discriminator) && discriminator.propertyName === key;
}

function membersOf(node: JsonObject, keyword: string): readonly unknown[] {
  const members = node[keyword];
  return Array.isArray(members) ? members : [];
}

/** The members of a composition keyword with their locations. */
function locatedMembers(owner: LocatedNode & { node: JsonObject }, keyword: string): LocatedNode[] {
  return membersOf(owner.node, keyword).map((node, index) => ({
    node,
    location: childLocation(owner.location, keyword, String(index)),
  }));
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
function composedMember(
  owner: LocatedNode & { node: JsonObject },
  key: string,
  input: MemberInput,
): GeneratedMember {
  const { node } = owner;
  const variants = [...locatedMembers(owner, "anyOf"), ...locatedMembers(owner, "oneOf")];
  const own = withoutComposition(node);
  const hasOwn = hasOwnObjectType(own);
  if (variants.length > 0) {
    const isAlone = membersOf(node, "allOf").length === 0 && !hasOwn;
    const members = variants.map((variant) => memberAt(variant, key, input));
    return isAlone && members.some((member) => member.kind === "missing") ? MISSING : OPAQUE;
  }
  const ownPart = { node: own, location: owner.location };
  const parts = [...locatedMembers(owner, "allOf"), ...(hasOwn ? [ownPart] : [])];
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

/**
 * A key of an owner the `unevaluated-properties` fix types: the type of its other keywords
 * intersected with an index signature (`unevaluatedPropertiesType`); without other keywords the
 * signature is the whole type. A key they miss reads the signature; a property they declare is
 * read alone, as an index signature of one part takes no part in a property another declares.
 */
function unevaluatedMember(
  owner: LocatedNode & { node: JsonObject },
  key: string,
  value: unknown,
  input: MemberInput,
): GeneratedMember {
  const { unevaluatedProperties: _unevaluated, ...rest } = owner.node;
  const properties = isJsonObject(rest.properties) ? rest.properties : {};
  const isExcludedKey =
    Object.hasOwn(properties, key) &&
    isExcludedProperty(properties[key], input.options, input.refs);
  const index = unevaluatedIndexMember(owner, value, isExcludedKey, input);
  if (!isComposed(rest) && !hasObjectKeywords(rest)) {
    return index;
  }
  const member = memberAt({ ...owner, node: rest }, key, { ...input, depth: input.depth + 1 });
  if (member.kind === "missing") {
    return index;
  }
  return member.kind === "property" || member.kind === "names" ? member : OPAQUE;
}

/**
 * Whether `key` names an `unevaluatedProperties` schema that the type ignores (no fix, or next to
 * `additionalProperties`). The original then reads another member, or `never` of
 * `Record<string, never>`, not the target, so the key counts as missing. `false` is `never`, as
 * the original reads it, and a property of that name is read as the property.
 */
function isIgnoredUnevaluatedKey(node: JsonObject, key: string): boolean {
  const value = node[UNEVALUATED_PROPERTIES];
  const properties = isJsonObject(node.properties) ? node.properties : {};
  const isIgnoredSchema = value !== undefined && value !== false;
  return key === UNEVALUATED_PROPERTIES && isIgnoredSchema && !Object.hasOwn(properties, key);
}

interface MemberInput {
  readonly options: SchemaOptions;
  readonly refs: RefResolver;
  readonly depth: number;
}

function memberAt(schema: LocatedNode, key: string, input: MemberInput): GeneratedMember {
  const followed = followLocated(schema, input.refs);
  const { node } = followed;
  if (!isJsonObject(node) || OPAQUE_KEYS.some((name) => name in node) || input.depth > MAX_DEPTH) {
    return OPAQUE;
  }
  const owner = { ...followed, node };
  if (isNullableSchema(node)) {
    // Every key of `T | null` is an error, unless `T` is unknown (then the type is `unknown`).
    return isObjectShape(node) || isArrayShape(node) ? MISSING : OPAQUE;
  }
  const unevaluated = unevaluatedSchemaOf(node as SchemaObject, input.options);
  if (unevaluated !== null) {
    return unevaluatedMember(owner, key, unevaluated, input);
  }
  if (isIgnoredUnevaluatedKey(node, key)) {
    return MISSING;
  }
  if (isComposed(node)) {
    return composedMember(owner, key, { ...input, depth: input.depth + 1 });
  }
  if (isObjectShape(node)) {
    return objectMember(owner, key, input);
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
  schema: LocatedNode,
  key: string,
  options: SchemaOptions,
  refs: RefResolver,
): GeneratedMember {
  return memberAt(schema, key, { options, refs, depth: 0 });
}
