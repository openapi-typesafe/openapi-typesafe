import {
  irIndexedAccess,
  irKeyword,
  irObject,
  irReference,
  irString,
} from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { createRef, parseRefPointer } from "../../../domain/openapi/json-pointer.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { OutputFix } from "../../../domain/output-fixes.js";
import { literalType } from "../literal-type.js";
import { refType } from "../ref-type.js";
import { intersectionOf, unionOf } from "../type-combinators.js";
import type {
  EnumDeclarationRequest,
  EnumMemberMetadata,
  SchemaOptions,
} from "./schema-context.js";
import type { SchemaRequest, SchemaRule } from "./schema-rule.js";

/** Removed from generated names, so `#/components/schemas/Status` gives `Status`. */
const COMPONENT_SCHEMAS_PREFIX = "components/schemas";
const UNION_KEYWORDS: ReadonlySet<string> = new Set(["anyOf", "oneOf"]);
const INDEX_RE = /^\d+$/;

function hasAdditionalProperties(schema: SchemaObject): boolean {
  return "additionalProperties" in schema && Boolean(schema.additionalProperties);
}

/** A name from the schema's pointer: `#/components/schemas/Pet/status` → `/Pet/status`. */
function nameFromPath(path: string | undefined): string {
  return parseRefPointer(path ?? "")
    .join("/")
    .replace(COMPONENT_SCHEMAS_PREFIX, "");
}

function hasEnumMetadata(schema: SchemaObject): boolean {
  return [
    schema["x-enum-varnames"],
    schema["x-enumNames"],
    schema["x-enum-descriptions"],
    schema["x-enumDescriptions"],
  ].some(Array.isArray);
}

/**
 * `--enum`: string and number enums become TypeScript enums. The original meant to allow `null`
 * too, but tested `typeof value` against `null`, so an enum containing null stays a union.
 */
function isTsEnum(schema: SchemaObject, options: SchemaOptions): boolean {
  if (!options.enum || !schema.enum) {
    return false;
  }
  const isSupported = schema.enum.every((value) => ["string", "number"].includes(typeof value));
  // `--conditional-enums` converts only enums that carry x-enum-* metadata.
  return isSupported && (!options.conditionalEnums || hasEnumMetadata(schema));
}

function enumMetadata(schema: SchemaObject): EnumMemberMetadata[] {
  return (schema.enum ?? []).map((_, index) => ({
    name: schema["x-enum-varnames"]?.[index] ?? schema["x-enumNames"]?.[index],
    description: schema["x-enum-descriptions"]?.[index] ?? schema["x-enumDescriptions"]?.[index],
  }));
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
function enumRequest(schema: SchemaObject, path: string | undefined): EnumDeclarationRequest {
  return {
    name: nameFromPath(path),
    values: (schema.enum ?? []) as (string | number)[],
    metadata: enumMetadata(schema),
  };
}

/** One member's type; a quoted member cannot follow a dot, `typeof E["+"]` is the same type. */
function enumMemberType(enumName: string, member: string): IrType {
  return member.startsWith('"')
    ? irIndexedAccess(irReference(`typeof ${enumName}`), irString(JSON.parse(member), "escaped"))
    : irReference(`${enumName}.${member}`);
}

/**
 * The `discriminator-enum-members` fix: an enum that the discriminator scan added to a member is
 * typed with members of the owner's enum (`PetType.Cat`), so the member's value is one of the
 * owner's type (#1700). Null when the owner's property is no TypeScript enum with every value.
 */
function ownerEnumMembersType(schema: SchemaObject, request: SchemaRequest): IrType | null {
  const { options, discriminators, footer } = request.context;
  const parent = options.fixes.has(OutputFix.DISCRIMINATOR_ENUM_MEMBERS)
    ? discriminators.enumParentOf(schema)
    : undefined;
  if (parent === undefined || !isTsEnum(parent.schema, options)) {
    return null;
  }
  const name = footer.addEnum(enumRequest(parent.schema, parent.path));
  const members = footer.enumMembers(name);
  const names = (schema.enum ?? []).map((value) => members.get(value as string | number));
  if (names.length === 0 || names.some((member) => member === undefined)) {
    return null;
  }
  return unionOf(names.map((member) => enumMemberType(name, member as string)));
}

function tsEnumType(schema: SchemaObject, request: SchemaRequest): IrType {
  const members = ownerEnumMembersType(schema, request);
  if (members !== null) {
    return members;
  }
  // `isTsEnum` admits only strings and numbers, so there is no null member to split off.
  const name = request.context.footer.addEnum(enumRequest(schema, request.location.path));
  return withOtherStrings(irReference(name), schema);
}

function isUnionPosition(pointer: readonly string[], index: number): boolean {
  const next = pointer[index + 1];
  return UNION_KEYWORDS.has(pointer[index] as string) && next !== undefined && INDEX_RE.test(next);
}

/**
 * The pointer of `--enum-values` arrays without union positions (`anyOf/0`), so names stay
 * stable. Every property after the first union position is narrowed with `Extract`: a no-op where
 * all variants have it, and the needed narrowing where only some do.
 */
function enumValuesPointer(path: string | undefined): { ref: string; extract: string[] } {
  const pointer = parseRefPointer(path ?? "");
  const kept: string[] = [];
  let firstVariantStart: number | null = null;
  for (let index = 0; index < pointer.length; index++) {
    if (isUnionPosition(pointer, index)) {
      firstVariantStart ??= index + 2;
      index++;
      continue;
    }
    kept.push(pointer[index] as string);
  }
  const extract =
    firstVariantStart === null
      ? []
      : pointer
          .slice(firstVariantStart)
          .filter((segment) => !UNION_KEYWORDS.has(segment) && !INDEX_RE.test(segment));
  return { ref: createRef(kept), extract };
}

function addEnumValues(schema: SchemaObject, request: SchemaRequest): void {
  const { ref, extract } = enumValuesPointer(request.location.path);
  const valuesType = refType(ref, { isDeep: true, extractProperties: extract });
  request.context.footer.addEnumValues({
    name: `${nameFromPath(request.location.path)}Values`,
    // A record value (`additionalProperties`) is reached by indexing with `string`.
    type: request.isFromAdditionalProperties
      ? irIndexedAccess(valuesType, irReference("string"))
      : valuesType,
    values: (schema.enum ?? []) as (string | number)[],
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
