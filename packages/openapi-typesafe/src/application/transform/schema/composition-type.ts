import { irKeyword, irRecord } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import {
  intersectionOf,
  isPrimitiveType,
  nullableOf,
  omitKeys,
  unionOf,
  withRequiredKeys,
} from "../type-combinators.js";
import { coreType } from "./core-type.js";
import { allOfMembers } from "./presence-members.js";
import type { SchemaRequest } from "./schema-rule.js";

/** `anyOf` / `oneOf` variants; the position is part of the path so nested names stay unique. */
function variantTypes(
  variants: readonly Schema[],
  keyword: "anyOf" | "oneOf",
  request: SchemaRequest,
): IrType[] {
  return variants.map((variant, index) =>
    request.transformNested(variant, {
      ...request.location,
      path: createRef([request.location.path, keyword, String(index)]),
    }),
  );
}

/**
 * Whether an `allOf` item is a `$ref`. Like the original, this uses `in`, so a boolean item throws
 * a TypeError instead of being accepted.
 */
function isRefItem(item: Schema): item is { readonly $ref: string } {
  return "$ref" in (item as object);
}

/** A `$ref` item gets the parent's `required` keys that its target defines (`WithRequired`). */
function refItemType(
  item: { readonly $ref: string },
  required: readonly string[],
  request: SchemaRequest,
): IrType {
  const type = request.transformNested(item, request.location);
  const { refs, discriminators, footer } = request.context;
  const resolved = refs.resolve(item.$ref) as SchemaObject | undefined;
  const isEligible =
    resolved &&
    typeof resolved === "object" &&
    "properties" in resolved &&
    !discriminators.isHandled(item.$ref);
  if (!isEligible) {
    return type;
  }
  const keys = required.filter((key) => Boolean(resolved.properties?.[key]));
  if (keys.length > 0) {
    footer.requireWithRequired();
  }
  return withRequiredKeys(type, keys);
}

/** An inline item merges the parent's `required` keys with its own. */
function inlineItemType(item: Schema, required: readonly string[], request: SchemaRequest): IrType {
  const own =
    typeof item === "object" && Array.isArray((item as SchemaObject).required)
      ? ((item as SchemaObject).required ?? [])
      : [];
  return request.transformNested(
    { ...(item as SchemaObject), required: [...required, ...own] },
    request.location,
  );
}

/** `allOf` items; an item with a discriminator omits that property (the parent redefines it). */
function allOfTypes(
  items: readonly Schema[],
  required: readonly string[],
  request: SchemaRequest,
): IrType[] {
  return items.map((item) => {
    const isRef = isRefItem(item);
    const type = isRef
      ? refItemType(item, required, request)
      : inlineItemType(item, required, request);
    const discriminator =
      (isRef && request.context.discriminators.objectAt(item.$ref)) ||
      (item as SchemaObject).discriminator;
    return discriminator?.propertyName ? omitKeys(type, [discriminator.propertyName]) : type;
  });
}

function oneOfType(previous: IrType | null, variants: readonly IrType[]): IrType {
  const before = previous === null ? [] : [previous];
  // Only `oneOf` may list primitives; then it stays a flat union.
  return variants.every(isPrimitiveType)
    ? unionOf([...before, ...variants])
    : intersectionOf([...before, unionOf(variants)]);
}

/** Object enums are written as `oneOf` over their values. */
function oneOfVariants(schema: SchemaObject): readonly Schema[] {
  const objectEnum =
    "type" in schema && schema.type === "object" && (schema.enum as Schema[] | undefined);
  return schema.oneOf || objectEnum || [];
}

/**
 * The parent's `required` keys, plus the keys of left-out `allOf` members (`allof-required`).
 * Without such keys the parent's list stays as it is, duplicates included, as in the original.
 */
function requiredKeys(schema: SchemaObject, presenceKeys: readonly string[]): readonly string[] {
  const own = schema.required ?? [];
  return presenceKeys.length === 0 ? own : [...new Set([...own, ...presenceKeys])];
}

function combinedType(schema: SchemaObject, request: SchemaRequest): IrType | null {
  let type: IrType | null = null;
  const core = coreType(schema, request);
  const { members, required } = allOfMembers(schema.allOf ?? [], request);
  const allOf = allOfTypes(members, requiredKeys(schema, required), request);
  if (core !== null || allOf.length > 0) {
    const allOfType = allOf.length > 0 ? [intersectionOf(allOf)] : [];
    type = intersectionOf([...(core === null ? [] : [core]), ...allOfType]);
  }
  // anyOf is a union: TypeScript unions are not exclusive, which matches anyOf better than oneOf.
  const anyOf = variantTypes(schema.anyOf ?? [], "anyOf", request);
  if (anyOf.length > 0) {
    type = unionOf([...(type === null ? [] : [type]), ...anyOf]);
  }
  const oneOf = variantTypes(oneOfVariants(schema), "oneOf", request);
  return oneOf.length > 0 ? oneOfType(type, oneOf) : type;
}

/**
 * The schema with composition: core type and `allOf` intersected, then `anyOf` and `oneOf`. Without
 * any of them: `Record<string, never>` (or `unknown` with `--empty-objects-unknown`) when `type` is
 * present, else `unknown`. `nullable: true` adds `null`, except to the shared `unknown`.
 */
export function compositionType(schema: SchemaObject, request: SchemaRequest): IrType {
  const { emptyObjectsUnknown } = request.context.options;
  const empty =
    "type" in schema
      ? irRecord(irKeyword("string"), emptyObjectsUnknown ? UNKNOWN_TYPE : irKeyword("never"))
      : UNKNOWN_TYPE;
  const type = combinedType(schema, request) ?? empty;
  return type !== UNKNOWN_TYPE && schema.nullable ? nullableOf([type]) : type;
}
