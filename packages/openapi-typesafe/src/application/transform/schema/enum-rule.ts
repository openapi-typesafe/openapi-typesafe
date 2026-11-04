import {
  irIndexedAccess,
  irKeyword,
  irObject,
  irReference,
} from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { createRef, parseRefPointer } from "../../../domain/openapi/json-pointer.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { OutputFix } from "../../../domain/output-fixes.js";
import { literalType } from "../literal-type.js";
import { refType } from "../ref-type.js";
import { intersectionOf, unionOf } from "../type-combinators.js";
import type { EnumMemberMetadata, SchemaOptions } from "./schema-context.js";
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
 * The values a TypeScript enum declares, with their positions in `enum`. With the
 * `nullable-enums` fix a `null` value is left out (upstream #1872): an enum member cannot be
 * `null`, so the type adds it as `| null` instead (`tsEnumType`).
 */
function tsEnumEntries(schema: SchemaObject, options: SchemaOptions): [unknown, number][] {
  const entries = (schema.enum ?? []).map((value, index): [unknown, number] => [value, index]);
  return options.fixes.has(OutputFix.NULLABLE_ENUMS)
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

function tsEnumType(schema: SchemaObject, request: SchemaRequest): IrType {
  const { options } = request.context;
  // `isTsEnum` admits only strings and numbers, and the fix leaves `null` out of the members.
  const entries = tsEnumEntries(schema, options);
  const name = request.context.footer.addEnum({
    name: nameFromPath(request.location.path),
    values: entries.map(([value]) => value as string | number),
    metadata: enumMetadata(schema, entries),
  });
  const type = withOtherStrings(irReference(name), schema);
  return options.fixes.has(OutputFix.NULLABLE_ENUMS) && isNullAllowed(schema)
    ? unionOf([type, irKeyword("null")])
    : type;
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
