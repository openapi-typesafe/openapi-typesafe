import { ERROR_CODES, OpenAPITypesafeError } from "../../../domain/errors.js";
import {
  irObject,
  irProperty,
  irReference,
  irStringIndexSignature,
} from "../../../domain/ir/constructors.js";
import type { IrMember, IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { appendPointer } from "../../../domain/openapi/json-pointer.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { documentEntries } from "../document-entries.js";
import type { JsonObject } from "../ref-pointer/located-node.js";
import { schemaRefType } from "../ref-pointer/pointer-type.js";
import { isWidenedIndex } from "../ref-pointer/property-shape.js";
import { schemaCommentOptionsOf, withSchemaComment } from "../schema-comment.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { intersectionOf, unionOf } from "../type-combinators.js";
import { type AccessFlags, propertyAccessFlags } from "./access-flags.js";
import { withPropertyTypes } from "./index-signature-type.js";
import { discriminatorMember, inheritedDiscriminator } from "./inherited-discriminator.js";
import { isInputLocation } from "./input-location.js";
import { refWithSiblingsAsAllOf } from "./ref-siblings.js";
import type { SchemaOptions } from "./schema-context.js";
import type { SchemaRequest, ValueAccess } from "./schema-rule.js";

export class InvalidPropertyError extends OpenAPITypesafeError {
  constructor(path: string | undefined, key: string, value: unknown) {
    const received = Array.isArray(value) ? "Array" : typeof value;
    super({
      code: ERROR_CODES.SCHEMA_PROPERTY_INVALID,
      message:
        `${path}: invalid property ${key}. ` + `Expected Schema Object or boolean, got ${received}`,
      details: { path, property: key, received },
    });
    this.name = "InvalidPropertyError";
  }
}

/** `--read-write-markers`: `$Read<T>` / `$Write<T>`, unless the property is both or neither. */
function withReadWriteMarker(type: IrType, flags: AccessFlags, options: SchemaOptions): IrType {
  if (!options.readWriteMarkers || flags.isReadOnly === flags.isWriteOnly) {
    return type;
  }
  return irReference(flags.isReadOnly ? "$Read" : "$Write", [type]);
}

/** Apply `transformProperty`, then the schema's JSDoc. */
function finishProperty(
  property: IrPropertySignature,
  schema: Schema,
  path: string,
  request: SchemaRequest,
): IrPropertySignature {
  const location = { ...request.location, path };
  const transformed =
    request.context.callbacks.transformProperty(property, schema, location) ?? property;
  // The original adds the schema's comment after any comment the callback set.
  return withSchemaComment(
    transformed,
    schema,
    schemaCommentOptionsOf(request.context.options.fixes),
  );
}

/** What the property loop reads from a property schema, in the original order. */
interface PropertyFacts {
  readonly ref: string | undefined;
  readonly flags: AccessFlags;
  readonly hasDefault: boolean;
}

function propertyFacts(value: Schema, request: SchemaRequest): PropertyFacts {
  if (typeof value !== "object") {
    return { ref: undefined, flags: { isReadOnly: false, isWriteOnly: false }, hasDefault: false };
  }
  // `in` throws for a null value, as in the original (which also reads `$ref` first).
  const ref = "$ref" in value && value.$ref ? value.$ref : undefined;
  const flags = propertyAccessFlags(value, request.context);
  return { ref, flags, hasDefault: "default" in value && value.default !== undefined };
}

function isOptionalProperty(
  key: string,
  facts: PropertyFacts,
  schema: SchemaObject,
  request: SchemaRequest,
): boolean {
  const { options } = request.context;
  const isDefaultRequired =
    facts.hasDefault &&
    options.defaultNonNullable &&
    !isInputLocation(request.location.path, options.fixes);
  const isRequired =
    schema.required?.includes(key) ||
    (schema.required === undefined && options.propertiesRequiredByDefault) ||
    isDefaultRequired;
  return !isRequired;
}

function isExcluded(value: Schema, facts: PropertyFacts, request: SchemaRequest): boolean {
  if (!request.context.options.excludeDeprecated) {
    return false;
  }
  const resolved = facts.ref ? request.context.refs.resolve(facts.ref) : value;
  return Boolean((resolved as SchemaObject | undefined)?.deprecated);
}

/** A type, and whether a callback forced the property optional (null: no override). */
interface CustomResult {
  readonly type: IrType;
  readonly isOptional: true | null;
}

/** A `$ref` with siblings that `ref-siblings` types as an `allOf` is typed as a schema. */
function plainRef({ ref }: PropertyFacts, value: Schema, request: SchemaRequest) {
  const isAllOf = ref && refWithSiblingsAsAllOf(value as SchemaObject, request.context.options);
  return isAllOf ? undefined : ref;
}

function propertyType(
  key: string,
  value: Schema,
  facts: PropertyFacts,
  request: SchemaRequest,
): CustomResult {
  const path = appendPointer(request.location.path, [key]);
  const ref = plainRef(facts, value, request);
  const type = ref
    ? schemaRefType(ref, request)
    : request.transformNested(value, { ...request.location, path });
  const custom = request.context.callbacks.transform(value, request.location);
  return custom === null
    ? { type, isOptional: null }
    : { type: custom.type, isOptional: custom.isOptional || null };
}

function propertyMember(
  key: string,
  value: Schema,
  schema: SchemaObject,
  request: SchemaRequest,
): IrMember | null {
  if ((typeof value !== "object" && typeof value !== "boolean") || Array.isArray(value)) {
    throw new InvalidPropertyError(request.location.path, key, value);
  }
  const facts = propertyFacts(value, request);
  if (isExcluded(value, facts, request)) {
    return null;
  }
  const { options } = request.context;
  const isOptional = isOptionalProperty(key, facts, schema, request);
  const result = propertyType(key, value, facts, request);
  const property = irProperty(
    toPropertyName(key),
    withReadWriteMarker(result.type, facts.flags, options),
    {
      isOptional: result.isOptional ?? isOptional,
      isReadonly: options.immutable || (!options.readWriteMarkers && facts.flags.isReadOnly),
    },
  );
  return finishProperty(property, value, appendPointer(request.location.path, [key]), request);
}

function propertyMembers(schema: SchemaObject, request: SchemaRequest): IrMember[] {
  const members: IrMember[] = [];
  for (const [key, value] of documentEntries(schema.properties ?? {}, request.context.options)) {
    const member = propertyMember(key, value, schema, request);
    if (member !== null) {
      members.push(member);
    }
  }
  return members;
}

/**
 * `$defs` as a nested `$defs?: { … }` member, in document order (never alphabetized). It is
 * optional because `$defs` is a schema keyword, not data: the original made it required, so a
 * value of the type needed a `$defs` key (research/legacy-bugs.md, item 17, upstream #2664).
 */
function defsMember(
  defs: Readonly<Record<string, SchemaObject>>,
  request: SchemaRequest,
): IrMember {
  const { options } = request.context;
  const members = Object.entries(defs).map(([key, value]) => {
    const path = appendPointer(request.location.path, ["$defs", key]);
    const flags = propertyAccessFlags(value, request.context);
    const type = withReadWriteMarker(
      request.transformNested(value, { ...request.location, path }),
      flags,
      options,
    );
    const property = irProperty(toPropertyName(key), type, {
      isReadonly: options.immutable || (!options.readWriteMarkers && flags.isReadOnly),
    });
    return finishProperty(property, value, path, request);
  });
  return irProperty(toPropertyName("$defs"), irObject(members), { isOptional: true });
}

function hasObjectKeywords(schema: SchemaObject): boolean {
  const hasProperties = Boolean(schema.properties && Object.keys(schema.properties).length);
  return (
    hasProperties ||
    Boolean(schema.additionalProperties || schema.patternProperties || schema.$defs)
  );
}

/**
 * Where an `additionalProperties` value is in the owner's type: `[string]`, unless the index
 * signature surely holds other types too. Next to `allOf` / `anyOf` / `oneOf` the original
 * `[string]` stays: it compiles, and its type is not surely another one.
 */
export function recordValueAccess(schema: SchemaObject, request: SchemaRequest): ValueAccess {
  const { options, refs } = request.context;
  return isWidenedIndex(schema as JsonObject, options, refs) ? "none" : "string-index";
}

/** Value types of the `[key: string]` index signature, in the original order. */
function indexValueTypes(schema: SchemaObject, request: SchemaRequest): IrType[] {
  const { additionalProperties } = schema;
  const isObject = typeof additionalProperties === "object";
  const hasExplicit = isObject && Object.keys(additionalProperties).length > 0;
  const hasImplicit =
    additionalProperties === true || (isObject && Object.keys(additionalProperties).length === 0);
  const types: IrType[] = [];
  if (hasExplicit) {
    const access = recordValueAccess(schema, request);
    types.push(request.transformNested(additionalProperties as Schema, request.location, access));
  }
  if (hasImplicit || (!additionalProperties && request.context.options.additionalProperties)) {
    types.push(UNKNOWN_TYPE);
  }
  const patterns = schema.patternProperties;
  if (typeof patterns === "object" && patterns !== null && Object.keys(patterns).length > 0) {
    for (const [, value] of documentEntries(patterns, request.context.options)) {
      types.push(request.transformNested(value, request.location));
    }
  }
  return types;
}

/**
 * Whether the schema declares property `key` and the type keeps it: `--exclude-deprecated` drops
 * a deprecated one.
 */
export function isKeptProperty(schema: SchemaObject, key: string, request: SchemaRequest): boolean {
  const properties = schema.properties ?? {};
  if (!Object.hasOwn(properties, key)) {
    return false;
  }
  const value = properties[key] as Schema;
  const isExcludable = request.context.options.excludeDeprecated && typeof value === "object";
  return !isExcludable || !isExcluded(value, propertyFacts(value, request), request);
}

/**
 * The members for the discriminator and `properties`. A schema that declares the discriminator
 * property itself keeps its own declaration, required as the discriminator needs: both in one
 * object type do not compile (TS2300, the Apple SiriKit Cloud Media API). A declaration that
 * `--exclude-deprecated` drops does not count, so the discriminator property stays.
 */
function discriminatorAndPropertyMembers(schema: SchemaObject, request: SchemaRequest): IrMember[] {
  const inherited = inheritedDiscriminator(schema, request);
  if (inherited === undefined) {
    return propertyMembers(schema, request);
  }
  const name = inherited.discriminator.propertyName;
  if (!isKeptProperty(schema, name, request)) {
    return [discriminatorMember(inherited, request), ...propertyMembers(schema, request)];
  }
  // Without `required`, `--properties-required-by-default` requires every property already; a
  // list of one would make the others optional.
  const isAllRequired =
    schema.required === undefined && request.context.options.propertiesRequiredByDefault;
  const required = isAllRequired ? undefined : [...(schema.required ?? []), name];
  return propertyMembers({ ...schema, required } as SchemaObject, request);
}

/**
 * Object keywords: discriminator, `properties`, `$defs`, and an index signature for
 * `additionalProperties` / `patternProperties` (or `--additional-properties`). Null when the schema
 * has none of them.
 */
export function objectType(schema: SchemaObject, request: SchemaRequest): IrType | null {
  if (!hasObjectKeywords(schema)) {
    const inherited = inheritedDiscriminator(schema, request);
    return inherited ? irObject([discriminatorMember(inherited, request)]) : null;
  }
  const members = discriminatorAndPropertyMembers(schema, request);
  const propertyTypes = members.flatMap((member) =>
    member.kind === "property" ? [member.type] : [],
  );
  // As in the original, a null `$defs` throws here (Object.keys) instead of being skipped.
  if (
    "$defs" in schema &&
    typeof schema.$defs === "object" &&
    Object.keys(schema.$defs).length > 0
  ) {
    members.push(defsMember(schema.$defs, request));
  }
  const valueTypes = indexValueTypes(schema, request);
  if (valueTypes.length === 0) {
    return members.length > 0 ? irObject(members) : null;
  }
  const indexType = withPropertyTypes(unionOf(valueTypes), propertyTypes);
  const index = irObject([
    irStringIndexSignature("key", indexType, request.context.options.immutable),
  ]);
  return intersectionOf([...(members.length > 0 ? [irObject(members)] : []), index]);
}
