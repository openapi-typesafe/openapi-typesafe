import { isRawBinarySchema } from "../../../domain/openapi/binary-content.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { isTsEnum } from "../schema/enum-rule.js";
import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import { unevaluatedSchemaOf } from "../schema/unevaluated-schema.js";
import {
  arrayMember,
  isBuiltInMember,
  literalMember,
  literalValuesOf,
  primitiveMember,
} from "./builtin-members.js";
import {
  type GeneratedMember,
  intersectionMember,
  isMissing,
  MISSING,
  NEVER_VALUES,
  OPAQUE,
  unionMember,
  variantsMember,
} from "./generated-member.js";
import { indexMember, unevaluatedIndexMember } from "./index-signature-member.js";
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
import {
  hasObjectKeywords,
  isArrayShape,
  isComposed,
  isDiscriminatorKey,
  isIgnoredUnevaluatedKey,
  isObjectShape,
  withVariantsOfListedType,
} from "./schema-shape.js";
import {
  hasOwnObjectType,
  locatedMembers,
  variantsFormOf,
  withoutComposition,
} from "./variants-form.js";

/**
 * What the generated type of a schema has under a key, read from the schema itself. It answers the
 * question TypeScript answers when it checks `T["key"]`, for the schema shapes where the answer is
 * sure; for every other shape it says `opaque`, so a caller never assumes an error that is not.
 */

/** A `$ref` left after following one is a cycle of `$ref`s, whose type is not read here. */
const REF_KEYWORD = "$ref";
const DEFS_KEYWORD = "$defs";

/**
 * A key of an object schema without object keywords. With a `type` it is `Record<string, never>`:
 * every key is `never`, and so is every key after it (or `unknown` with `--empty-objects-unknown`,
 * which has no key). Without a `type` it is `unknown`.
 */
function emptyObjectMember(node: JsonObject, options: SchemaOptions): GeneratedMember {
  return node.type !== undefined && !options.emptyObjectsUnknown ? NEVER_VALUES : MISSING;
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

/**
 * `allOf` with own keywords is an intersection (`intersectionMember`). `anyOf` or `oneOf` alone
 * is a union (`unionMember`). Next to own keywords or `allOf` items they join that base as
 * `variantsFormOf` reads it.
 */
function composedMember(
  owner: LocatedNode & { node: JsonObject },
  key: string,
  input: MemberInput,
): GeneratedMember {
  const { node } = owner;
  const variants = [...locatedMembers(owner, "anyOf"), ...locatedMembers(owner, "oneOf")];
  const own = withoutComposition(node);
  const ownPart = { node: own, location: owner.location };
  const parts = [...locatedMembers(owner, "allOf"), ...(hasOwnObjectType(own) ? [ownPart] : [])];
  const members = variants.map((variant) => memberAt(variant, key, input));
  // One keyword alone is a union of its variants. Both make `(A | B) & (C | D)` or one union.
  const isOneKeyword = !("anyOf" in node && "oneOf" in node);
  if (parts.length === 0 && isOneKeyword) {
    return unionMember(members);
  }
  if (parts.length === 0) {
    return members.some(isMissing) ? MISSING : OPAQUE;
  }
  const base = intersectionMember(parts.map((part) => memberAt(part, key, input)));
  return variants.length === 0
    ? base
    : variantsMember(base, members, variantsFormOf(node, input), key);
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
  const member = memberAt({ ...owner, node: rest }, key, input);
  if (isMissing(member)) {
    return index;
  }
  return member.kind === "property" || member.kind === "names" ? member : OPAQUE;
}

interface MemberInput {
  readonly options: SchemaOptions;
  readonly refs: RefResolver;
  /** The schemas being read, outer first: one met again is a cycle of `$ref`s. */
  readonly path: ReadonlySet<unknown>;
}

function memberAt(schema: LocatedNode, key: string, input: MemberInput): GeneratedMember {
  const followed = followLocated(schema, input.refs);
  const { node } = followed;
  if (!isJsonObject(node) || REF_KEYWORD in node || input.path.has(node)) {
    return OPAQUE;
  }
  const inner: MemberInput = { ...input, path: new Set([...input.path, node]) };
  const literals = literalValuesOf(node);
  if (literals !== null) {
    return literalMember(literals, key, isTsEnum(node as SchemaObject, input.options));
  }
  if (isNullableSchema(node)) {
    // Every key of `T | null` is an error, also where `T` is a composition or `unknown`, which
    // has no keys either (`unknown | null` is `unknown`).
    return MISSING;
  }
  // A `type` list of one type (`[object]`) joins its variants as that type alone does.
  return shapedMember({ ...followed, node: withVariantsOfListedType(node) }, key, inner);
}

/** The member `key` of a schema that is no `$ref` and not nullable, by its shape. */
function shapedMember(
  owner: LocatedNode & { node: JsonObject },
  key: string,
  input: MemberInput,
): GeneratedMember {
  const { node } = owner;
  const unevaluated = unevaluatedSchemaOf(node as SchemaObject, input.options);
  if (unevaluated !== null) {
    return unevaluatedMember(owner, key, unevaluated, input);
  }
  if (isIgnoredUnevaluatedKey(node, key)) {
    return MISSING;
  }
  if (isComposed(node)) {
    return composedMember(owner, key, input);
  }
  if (isObjectShape(node)) {
    return objectMember(owner, key, input);
  }
  if (isArrayShape(node)) {
    return arrayMember(owner, key);
  }
  // `--binary-as-blob` types raw binary strings as `Blob`, which has members of its own.
  return input.options.binaryAsBlob && isRawBinarySchema(node as never)
    ? OPAQUE
    : primitiveMember(node, key);
}

/**
 * Whether a composed schema's type surely has no member `key` (a union whose variant misses it),
 * read without the schema's nullability: the typed walk reads it through `NonNullable`. Only the
 * variants of a `type` list are read so (`withVariantsOfListedType`); a base alone reads its
 * nullable own part as missing, as for `nullable: true`, which types the target in place.
 */
export function isMissingComposedKey(
  schema: LocatedNode,
  key: string,
  options: SchemaOptions,
  refs: RefResolver,
): boolean {
  const followed = followLocated(schema, refs);
  const node = isJsonObject(followed.node)
    ? withVariantsOfListedType(followed.node)
    : followed.node;
  const isComposedOnly =
    isJsonObject(node) &&
    isComposed(node) &&
    unevaluatedSchemaOf(node as SchemaObject, options) === null;
  const input = { options, refs, path: new Set() };
  return isComposedOnly && isMissing(composedMember({ ...followed, node }, key, input));
}

/** The member `key` of the type generated for `schema` (a `$ref` is followed first). */
export function generatedMember(
  schema: LocatedNode,
  key: string,
  options: SchemaOptions,
  refs: RefResolver,
): GeneratedMember {
  return memberAt(schema, key, { options, refs, path: new Set() });
}
