import { irKeyword, irObject, irProperty, irReference } from "../../../domain/ir/constructors.js";
import type {
  IrIndexSignature,
  IrMember,
  IrPropertySignature,
  IrType,
} from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { documentEntries } from "../document-entries.js";
import { refType } from "../ref-type.js";
import { withSchemaComment } from "../schema-comment.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { intersectionOf, unionOf } from "../type-combinators.js";
import { discriminatorProperty } from "./discriminator-property.js";
import type { SchemaOptions } from "./schema-context.js";
import type { SchemaRequest } from "./schema-rule.js";

/** Path parts where a default value cannot make a property required (inputs may omit it). */
const INPUT_PATH_PARTS = ["parameters", "requestBody", "requestBodies"] as const;

export class InvalidPropertyError extends Error {
  constructor(path: string | undefined, key: string, value: unknown) {
    const received = Array.isArray(value) ? "Array" : typeof value;
    super(`${path}: invalid property ${key}. Expected Schema Object or boolean, got ${received}`);
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

interface AccessFlags {
  readonly isReadOnly: boolean;
  readonly isWriteOnly: boolean;
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
  return withSchemaComment(transformed, schema);
}

/** What the property loop reads from a property schema, in the original order. */
interface PropertyFacts {
  readonly ref: string | undefined;
  readonly flags: AccessFlags;
  readonly hasDefault: boolean;
}

function propertyFacts(value: Schema): PropertyFacts {
  if (typeof value !== "object") {
    return { ref: undefined, flags: { isReadOnly: false, isWriteOnly: false }, hasDefault: false };
  }
  // `in` throws for a null value, as in the original (which also reads `$ref` first).
  const ref = "$ref" in value && value.$ref ? value.$ref : undefined;
  const flags = {
    isReadOnly: Boolean("readOnly" in value && value.readOnly),
    isWriteOnly: Boolean("writeOnly" in value && value.writeOnly),
  };
  return { ref, flags, hasDefault: "default" in value && value.default !== undefined };
}

function isOptionalProperty(
  key: string,
  facts: PropertyFacts,
  schema: SchemaObject,
  request: SchemaRequest,
): boolean {
  const { options } = request.context;
  const path = request.location.path;
  const isDefaultRequired =
    facts.hasDefault &&
    options.defaultNonNullable &&
    !INPUT_PATH_PARTS.some((part) => path?.includes(part));
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

function propertyType(
  key: string,
  value: Schema,
  facts: PropertyFacts,
  request: SchemaRequest,
): CustomResult {
  const path = createRef([request.location.path, key]);
  const type = facts.ref
    ? refType(facts.ref)
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
  const facts = propertyFacts(value);
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
  return finishProperty(property, value, createRef([request.location.path, key]), request);
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

/** `$defs` as a nested `$defs: { … }` member, in document order (never alphabetized). */
function defsMember(
  defs: Readonly<Record<string, SchemaObject>>,
  request: SchemaRequest,
): IrMember {
  const { options } = request.context;
  const members = Object.entries(defs).map(([key, value]) => {
    const path = createRef([request.location.path, "$defs", key]);
    const flags = {
      isReadOnly: "readOnly" in value && !!value.readOnly,
      isWriteOnly: "writeOnly" in value && !!value.writeOnly,
    };
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
  return irProperty(toPropertyName("$defs"), irObject(members));
}

function hasObjectKeywords(schema: SchemaObject): boolean {
  const hasProperties = Boolean(schema.properties && Object.keys(schema.properties).length);
  return (
    hasProperties ||
    Boolean(schema.additionalProperties || schema.patternProperties || schema.$defs)
  );
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
    types.push(request.transformNested(additionalProperties as Schema, request.location, true));
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

function indexSignature(type: IrType, isReadonly: boolean): IrIndexSignature {
  return {
    kind: "indexSignature",
    parameterName: "key",
    parameterType: irKeyword("string"),
    type,
    isReadonly,
    comments: [],
  };
}

/** The discriminator property that a parent's mapping implies for this schema, if any. */
function discriminatorMembers(schema: SchemaObject, request: SchemaRequest): IrMember[] {
  if (!schema.allOf && !schema.anyOf) {
    return [];
  }
  const path = request.location.path ?? "";
  const { discriminators, options } = request.context;
  // A schema does not get the discriminator it defines for its children, nor one added already.
  const discriminator =
    !schema.discriminator && !discriminators.isHandled(path) && discriminators.objectAt(path);
  return discriminator ? [discriminatorProperty(discriminator, path, options.immutable)] : [];
}

/**
 * Object keywords: discriminator, `properties`, `$defs`, and an index signature for
 * `additionalProperties` / `patternProperties` (or `--additional-properties`). Null when the schema
 * has none of them.
 */
export function objectType(schema: SchemaObject, request: SchemaRequest): IrType | null {
  const members = discriminatorMembers(schema, request);
  if (!hasObjectKeywords(schema)) {
    return members.length > 0 ? irObject(members) : null;
  }
  members.push(...propertyMembers(schema, request));
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
  const index = irObject([indexSignature(unionOf(valueTypes), request.context.options.immutable)]);
  return intersectionOf([...(members.length > 0 ? [irObject(members)] : []), index]);
}
