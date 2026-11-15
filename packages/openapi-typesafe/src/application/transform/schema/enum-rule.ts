import {
  irIndexedAccess,
  irKeyword,
  irObject,
  irReference,
  irString,
} from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { parseRefPointer } from "../../../domain/openapi/json-pointer.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import { literalType } from "../literal-type.js";
import { refType } from "../ref-type.js";
import { intersectionOf, unionOf } from "../type-combinators.js";
import { enumValuesPointer } from "./enum-values-pointer.js";
import type {
  DiscriminatorEnumParent,
  EnumDeclarationRequest,
  EnumMemberMetadata,
  SchemaOptions,
} from "./schema-context.js";
import type { SchemaRequest, SchemaRule } from "./schema-rule.js";

/** Removed from generated names, so `#/components/schemas/Status` gives `Status`. */
const COMPONENT_SCHEMAS_PREFIX = "components/schemas";

function hasAdditionalProperties(schema: SchemaObject): boolean {
  return "additionalProperties" in schema && Boolean(schema.additionalProperties);
}

/** A name from the schema's pointer: `#/components/schemas/Pet/status` → `/Pet/status`. */
function nameFromPath(path: string | undefined): string {
  return parseRefPointer(path ?? "")
    .join("/")
    .replace(COMPONENT_SCHEMAS_PREFIX, "");
}

/** `#/components/schemas/Name`, and no deeper pointer. */
const COMPONENT_SCHEMA_RE = /^#\/components\/schemas\/[^/]+$/;

function hasEnumMetadata(schema: SchemaObject): boolean {
  return [
    schema["x-enum-varnames"],
    schema["x-enumNames"],
    schema["x-enum-descriptions"],
    schema["x-enumDescriptions"],
  ].some(Array.isArray);
}

/**
 * The values a TypeScript enum declares, with their positions in `enum`. With the
 * `nullable-enums` fix a `null` value is left out (upstream #1872): an enum member cannot be
 * `null`, so the type adds it as `| null` instead (`tsEnumType`).
 */
function tsEnumEntries(schema: SchemaObject, options: SchemaOptions): [unknown, number][] {
  const entries = (schema.enum ?? []).map((value, index): [unknown, number] => [value, index]);
  return options.fixes.has(FIX.NULLABLE_ENUMS)
    ? entries.filter(([value]) => value !== null)
    : entries;
}

/**
 * `--enum`: string and number enums become TypeScript enums. The original meant to allow `null`
 * too, but tested `typeof value` against `null`, so an enum containing null stays a union; the
 * `nullable-enums` fix declares its other values.
 */
function isTsEnum(schema: SchemaObject, options: SchemaOptions): boolean {
  if (!options.enum || !schema.enum) {
    return false;
  }
  const entries = tsEnumEntries(schema, options);
  // An empty `enum` stays an empty TypeScript enum, as the original made it; an enum of only
  // `null` has no member left once the fix drops `null`, so it stays a union.
  const isOnlyNull = entries.length === 0 && schema.enum.length > 0;
  const isSupported =
    !isOnlyNull && entries.every(([value]) => ["string", "number"].includes(typeof value));
  // `--conditional-enums` converts only enums that carry x-enum-* metadata.
  return isSupported && (!options.conditionalEnums || hasEnumMetadata(schema));
}

function enumMetadata(
  schema: SchemaObject,
  entries: readonly [unknown, number][],
): EnumMemberMetadata[] {
  return entries.map(([, index]) => ({
    name: schema["x-enum-varnames"]?.[index] ?? schema["x-enumNames"]?.[index],
    description: schema["x-enum-descriptions"]?.[index] ?? schema["x-enumDescriptions"]?.[index],
  }));
}

/**
 * Whether `null` is a valid value: it is in `enum` and the schema's type admits it (`type`
 * absent or listing `"null"`, or OpenAPI 3.0 `nullable: true`). Both keywords must pass.
 */
function isNullAllowed(schema: SchemaObject): boolean {
  const { type } = schema;
  const isTypeNullable =
    type === undefined ||
    (Array.isArray(type) && type.includes("null")) ||
    Boolean(schema.nullable);
  return (schema.enum ?? []).includes(null) && isTypeNullable;
}

/**
 * `additionalProperties: true` on a string enum keeps other strings allowed but still offers the
 * listed values in editors: `"a" | "b" | (string & {})`.
 */
function withOtherStrings(type: IrType, schema: SchemaObject): IrType {
  if (!hasAdditionalProperties(schema) || schema.type !== "string") {
    return type;
  }
  return unionOf([type, intersectionOf([irKeyword("string"), irObject([])])]);
}

/** The enum declaration of `schema` typed at `path`; its values are strings and numbers. */
function enumRequest(
  schema: SchemaObject,
  path: string | undefined,
  options: SchemaOptions,
): EnumDeclarationRequest {
  const entries = tsEnumEntries(schema, options);
  return {
    name: nameFromPath(path),
    isComponentSchema: COMPONENT_SCHEMA_RE.test(path ?? ""),
    values: entries.map(([value]) => value as string | number),
    metadata: enumMetadata(schema, entries),
  };
}

/** One member's type; a quoted member cannot follow a dot, `typeof E["+"]` is the same type. */
function enumMemberType(enumName: string, member: string): IrType {
  return member.startsWith('"')
    ? irIndexedAccess(irReference(`typeof ${enumName}`), irString(JSON.parse(member), "escaped"))
    : irReference(`${enumName}.${member}`);
}

/**
 * The `discriminator-values` fix: a member's discriminator value is typed with members of
 * the owner's enum (`PetType.Cat`), so the member is one of the owner's type (#1700). `key` is the
 * enum the scan added or the inherited discriminator object. Null when the fix is off, or the
 * owner's property is no TypeScript enum with every value.
 */
export function ownerEnumMembersType(
  key: object,
  values: readonly unknown[],
  request: SchemaRequest,
): IrType | null {
  const { options, discriminators, footer } = request.context;
  const parent: DiscriminatorEnumParent | undefined = options.fixes.has(FIX.DISCRIMINATOR_VALUES)
    ? discriminators.enumParentOf(key)
    : undefined;
  if (parent === undefined || !isTsEnum(parent.schema, options)) {
    return null;
  }
  const reference = { ...enumRequest(parent.schema, parent.path, options), isOwnerReference: true };
  const name = footer.addEnum(reference);
  const members = footer.enumMembers(name);
  const names = values.map((value) => members.get(value as string | number));
  if (names.length === 0 || names.some((member) => member === undefined)) {
    return null;
  }
  return unionOf(names.map((member) => enumMemberType(name, member as string)));
}

/**
 * The position of the schema in the tuple that transforms it (`prefixItems`, an `items` list)
 * when it is a direct element, wherever the tuple is: a component, a property, an `items`, a
 * union member, a parameter or a body. An enum inside an element's `allOf` is not one: it shares
 * the element's enum with the element's other schemas.
 */
function tupleElement(schema: SchemaObject, request: SchemaRequest): { tupleIndex?: number } {
  const tuple = request.parent;
  if (tuple === undefined) {
    return {};
  }
  const elements = tuple.prefixItems ?? (Array.isArray(tuple.items) ? tuple.items : []);
  const index = (elements as readonly unknown[]).indexOf(schema);
  return index === -1 ? {} : { tupleIndex: index };
}

/** The location the walk of the document types the schema at; none for a `$ref`'s target. */
function walkedLocation(request: SchemaRequest): { walkedAt?: string } {
  return request.isThroughRef ? {} : { walkedAt: request.location.path ?? "" };
}

function tsEnumType(schema: SchemaObject, request: SchemaRequest): IrType {
  const { options, footer } = request.context;
  // `isTsEnum` admits only strings and numbers, and the fix leaves `null` out of the members.
  const values = tsEnumEntries(schema, options).map(([value]) => value);
  const declaration = enumRequest(schema, request.location.path, options);
  const element = {
    ...tupleElement(schema, request),
    ...walkedLocation(request),
    isAtSharedLocation: request.isAtSharedLocation,
  };
  const type =
    ownerEnumMembersType(schema, values, request) ??
    withOtherStrings(irReference(footer.addEnum({ ...declaration, ...element })), schema);
  return options.fixes.has(FIX.NULLABLE_ENUMS) && isNullAllowed(schema)
    ? unionOf([type, irKeyword("null")])
    : type;
}

/** The item type of an `--enum-values` array: its schema's place in the generated types. */
function enumValuesType(values: readonly (string | number)[], request: SchemaRequest): IrType {
  if (request.valueAccess === "none") {
    // No place has this schema's type alone; the location check keeps this type.
    return unionOf(values.map(literalType));
  }
  const { ref, extract } = enumValuesPointer(request.location.path, request.typePlacement);
  const valuesType = refType(ref, { isDeep: true, extractProperties: extract });
  // A record value (`additionalProperties`) is reached by indexing with `string`.
  return request.valueAccess === "string-index"
    ? irIndexedAccess(valuesType, irKeyword("string"))
    : valuesType;
}

function addEnumValues(schema: SchemaObject, request: SchemaRequest): void {
  const values = (schema.enum ?? []) as (string | number)[];
  request.context.footer.addEnumValues({
    name: `${nameFromPath(request.location.path)}Values`,
    type: enumValuesType(values, request),
    values,
    ...tupleElement(schema, request),
    ...walkedLocation(request),
  });
}

function literalEnumType(schema: SchemaObject, request: SchemaRequest): IrType {
  const values = schema.enum ?? [];
  const isNullable =
    (Array.isArray(schema.type) && schema.type.includes("null")) || Boolean(schema.nullable);
  const literals = [...values.map(literalType), ...(isNullable ? [irKeyword("null")] : [])];
  const type = withOtherStrings(unionOf(literals), schema);
  const isListable = values.every(
    (value) => typeof value === "string" || typeof value === "number",
  );
  if (request.context.options.enumValues && isListable) {
    addEnumValues(schema, request);
  }
  return type;
}

/**
 * `enum` on anything but an object (object enums are handled as `oneOf`). With
 * `additionalProperties`, only string enums are handled here; others fall through to composition.
 */
export const enumRule: SchemaRule = {
  name: "enum",
  matches(schema) {
    const isCandidate =
      Array.isArray(schema.enum) && schema.type !== "object" && !("properties" in schema);
    return isCandidate && (!hasAdditionalProperties(schema) || schema.type === "string");
  },
  transform(schema, request) {
    return isTsEnum(schema, request.context.options)
      ? tsEnumType(schema, request)
      : literalEnumType(schema, request);
  },
};
