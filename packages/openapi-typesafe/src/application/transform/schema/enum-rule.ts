import {
  irIndexedAccess,
  irKeyword,
  irObject,
  irReference,
} from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import { enumMemberType } from "../enum-member-type.js";
import { literalType } from "../literal-type.js";
import { refType } from "../ref-type.js";
import { intersectionOf, unionOf } from "../type-combinators.js";
import { baseValuesType } from "./base-enum-type.js";
import { enumRequest, isTsEnum, nameFromPath, tsEnumEntries } from "./enum-declaration.js";
import { enumValuesPointer } from "./enum-values-pointer.js";
import type {
  DiscriminatorEnumParent,
  EnumDeclarationRequest,
  FooterDeclarations,
} from "./schema-context.js";
import type { SchemaRequest, SchemaRule } from "./schema-rule.js";

function hasAdditionalProperties(schema: SchemaObject): boolean {
  return "additionalProperties" in schema && Boolean(schema.additionalProperties);
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

/**
 * The reference to the enum of a request, for the values it lists. Other requests of the enum's
 * owner may add values to it, so the run's end narrows it to these (`enumReferenceNarrowing`).
 */
function enumReference(footer: FooterDeclarations, request: EnumDeclarationRequest): IrType {
  return { ...irReference(footer.addEnum(request)), enumValues: request.values };
}

/**
 * The schema's own enum, or the enum or literals of a base the `allOf` intersects it with
 * (`baseValuesType`). The own enum is declared either way, so code that names it keeps compiling.
 */
function ownOrBaseEnumType(
  values: readonly unknown[],
  declaration: EnumDeclarationRequest,
  request: SchemaRequest,
): IrType {
  const own = enumReference(request.context.footer, declaration);
  const ownMembers = (kept: readonly unknown[]) => [
    { ...own, enumValues: kept as (string | number)[] },
  ];
  return baseValuesType(values, "enum", ownMembers, request) ?? own;
}

function tsEnumType(schema: SchemaObject, request: SchemaRequest): IrType {
  const { options } = request.context;
  // `isTsEnum` admits only strings and numbers, and the fix leaves `null` out of the members.
  const values = tsEnumEntries(schema, options).map(([value]) => value);
  const declaration = enumRequest(schema, request.location.path, options);
  const element = {
    ...tupleElement(schema, request),
    ...walkedLocation(request),
    sharedSlot: request.sharedSlot,
  };
  const ownerType = ownerEnumMembersType(schema, values, request);
  if (
    ownerType !== null &&
    request.context.discriminators.enumParentOf(schema)?.isDeclaredByMember
  ) {
    // A member's own enum of its value stays declared, so code that names it keeps compiling.
    enumReference(request.context.footer, { ...declaration, ...element });
  }
  const type =
    ownerType ??
    withOtherStrings(ownOrBaseEnumType(values, { ...declaration, ...element }, request), schema);
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

/**
 * The literals of an enum, or of a `const`: as the discriminator owner's enum members or the
 * forms a base admits them in (`baseValuesType`) where they are values of those, else literals.
 * `null` stays a literal: no enum has it as a member.
 */
export function literalValuesType(
  schema: SchemaObject,
  values: readonly unknown[],
  request: SchemaRequest,
): IrType[] {
  const listed = values.filter((value) => value !== null);
  const own = (kept: readonly unknown[]) => kept.map(literalType);
  const retyped =
    (listed.length > 0 ? ownerEnumMembersType(schema, listed, request) : null) ??
    baseValuesType(listed, "literal", own, request);
  if (retyped === null) {
    return values.map(literalType);
  }
  return [retyped, ...(listed.length < values.length ? [literalType(null)] : [])];
}

function literalEnumType(schema: SchemaObject, request: SchemaRequest): IrType {
  const values = schema.enum ?? [];
  const isNullable =
    (Array.isArray(schema.type) && schema.type.includes("null")) || Boolean(schema.nullable);
  const valueTypes = literalValuesType(schema, values, request);
  const literals = [...valueTypes, ...(isNullable ? [irKeyword("null")] : [])];
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
