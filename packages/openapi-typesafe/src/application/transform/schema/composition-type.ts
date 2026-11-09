import { irKeyword, irRecord } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { appendPointer } from "../../../domain/openapi/json-pointer.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import { requirableRefType } from "../ref-pointer/pointer-type.js";
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
import { unionItemOf, unionOwnKeywords } from "./discriminated-union.js";
import { allOfMembers } from "./presence-members.js";
import { requiredVariantsType } from "./required-variants.js";
import type { SchemaRequest } from "./schema-rule.js";
import { unevaluatedPropertiesType } from "./unevaluated-properties.js";

/** `anyOf` / `oneOf` variants; the position is part of the path so nested names stay unique. */
function variantTypes(
  variants: readonly Schema[],
  keyword: "anyOf" | "oneOf",
  request: SchemaRequest,
): IrType[] {
  return variants.map((variant, index) =>
    request.transformNested(variant, {
      ...request.location,
      path: appendPointer(request.location.path, [keyword, index]),
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

/**
 * The parent's `required` keys that the target at `ref` defines. A target that the discriminator
 * scan gave its property got none: the scan made that property required, but the other keys were
 * lost too. With `discriminator-member-required` only keys the target requires already are left
 * out (#2162).
 */
function keysToRequire(
  ref: string,
  target: SchemaObject,
  required: readonly string[],
  request: SchemaRequest,
): readonly string[] {
  const defined = required.filter((key) => Boolean(target.properties?.[key]));
  if (!request.context.discriminators.isHandled(ref)) {
    return defined;
  }
  if (!request.context.options.fixes.has(FIX.DISCRIMINATOR_MEMBER_REQUIRED)) {
    return [];
  }
  return defined.filter((key) => !target.required?.includes(key));
}

/** A `$ref` item gets the parent's `required` keys that its target defines (`WithRequired`). */
function refItemType(
  item: { readonly $ref: string },
  required: readonly string[],
  request: SchemaRequest,
): IrType {
  const type = request.transformNested(item, request.location);
  const resolved = request.context.refs.resolve(item.$ref) as SchemaObject | undefined;
  if (!resolved || typeof resolved !== "object" || !("properties" in resolved)) {
    return type;
  }
  const keys = keysToRequire(item.$ref, resolved, required, request);
  if (keys.length === 0) {
    return type;
  }
  request.context.footer.requireWithRequired();
  return withRequiredKeys(requirableRefType(item.$ref, type, request), keys);
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

/**
 * The union's own keywords at the union's location, so nested names (enums) stay the union's.
 * Null when the union has none.
 */
function ownKeywordsType(own: SchemaObject, ref: string, request: SchemaRequest): IrType | null {
  return combinedType(own, { ...request, location: { ...request.location, path: ref } });
}

/**
 * An `allOf` item; one with a discriminator omits that property (the parent redefines it). A
 * `$ref` to a discriminated union is not such a parent: for a member of the union it is the
 * union's own keywords, since the union contains the member (#1665); with
 * `allof-discriminated-union` it is the union, since `Omit` on a union drops keys (#1464), unless
 * the union's mapping names the schema: then it is a member, as the discriminator scan has it.
 */
function allOfItemType(
  item: Schema,
  required: readonly string[],
  request: SchemaRequest,
): IrType | null {
  const isRef = isRefItem(item);
  const discriminator =
    (isRef && request.context.discriminators.objectAt(item.$ref)) ||
    (item as SchemaObject).discriminator;
  const propertyName = discriminator?.propertyName;
  const unionItem = isRef && propertyName ? unionItemOf(item.$ref, request) : undefined;
  if (isRef && propertyName && unionItem?.isMember) {
    const own = unionOwnKeywords(unionItem.union, propertyName, required);
    return ownKeywordsType(own, item.$ref, request);
  }
  const type = isRef
    ? refItemType(item, required, request)
    : inlineItemType(item, required, request);
  const isUnion =
    unionItem !== undefined &&
    !unionItem.isMapped &&
    request.context.options.fixes.has(FIX.ALLOF_DISCRIMINATED_UNION);
  if (!propertyName || isUnion) {
    return type;
  }
  // With `discriminator-values` the schema also redefines the properties of other owners above
  // it, so no item may keep a value of its own for them (a parent mapped as `content`).
  const { path } = request.location;
  const others = path === undefined ? [] : request.context.discriminators.otherPropertiesAt(path);
  return omitKeys(type, [propertyName, ...others]);
}

function allOfTypes(
  items: readonly Schema[],
  required: readonly string[],
  request: SchemaRequest,
): IrType[] {
  return items.flatMap((item) => allOfItemType(item, required, request) ?? []);
}

function oneOfType(previous: IrType | null, variants: readonly IrType[]): IrType {
  const before = previous === null ? [] : [previous];
  // Only `oneOf` may list primitives; then it stays a flat union.
  return variants.every(isPrimitiveType)
    ? unionOf([...before, ...variants])
    : intersectionOf([...before, unionOf(variants)]);
}

/**
 * `anyOf` is a union: TypeScript unions are not exclusive, which matches anyOf better than oneOf.
 * By default the sibling type is one more member, as in the original. With `anyof-properties` it
 * is intersected with the union, so it applies to every variant (#2380); for a `type` list, each
 * listed type has applied `anyOf` already (`multipleTypes`), so the list is the whole type.
 */
function anyOfType(
  previous: IrType | null,
  schema: SchemaObject,
  request: SchemaRequest,
): IrType | null {
  const variants = variantTypes(schema.anyOf ?? [], "anyOf", request);
  if (variants.length === 0 || previous === null) {
    return variants.length === 0 ? previous : unionOf(variants);
  }
  if (!request.context.options.fixes.has(FIX.ANYOF_PROPERTIES)) {
    return unionOf([previous, ...variants]);
  }
  return Array.isArray(schema.type) ? previous : intersectionOf([previous, unionOf(variants)]);
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

function composedType(schema: SchemaObject, request: SchemaRequest): IrType | null {
  let type: IrType | null = null;
  const core = coreType(schema, request);
  const { members, required } = allOfMembers(schema.allOf ?? [], request);
  const allOf = allOfTypes(members, requiredKeys(schema, required), request);
  if (core !== null || allOf.length > 0) {
    const allOfType = allOf.length > 0 ? [intersectionOf(allOf)] : [];
    type = intersectionOf([...(core === null ? [] : [core]), ...allOfType]);
  }
  return variantsType(type, schema, request);
}

/** `anyOf`, then `oneOf`, applied to the core and `allOf` type (`anyof-oneof-required` first). */
function variantsType(
  previous: IrType | null,
  schema: SchemaObject,
  request: SchemaRequest,
): IrType | null {
  const type =
    requiredVariantsType(previous, schema, schema.anyOf ?? [], request) ??
    anyOfType(previous, schema, request);
  const oneOfRequired = requiredVariantsType(type, schema, schema.oneOf ?? [], request);
  if (oneOfRequired !== null) {
    return oneOfRequired;
  }
  const oneOf = variantTypes(oneOfVariants(schema), "oneOf", request);
  return oneOf.length > 0 ? oneOfType(type, oneOf) : type;
}

/** The composed type, with the `unevaluatedProperties` index signature when it applies. */
function combinedType(schema: SchemaObject, request: SchemaRequest): IrType | null {
  const type = composedType(schema, request);
  const unevaluated = unevaluatedPropertiesType(schema, type, request);
  if (unevaluated === null) {
    return type;
  }
  if (type === null) {
    return unevaluated;
  }
  // One flat intersection, so an `allOf` intersection is not printed in parentheses.
  const parts = type.kind === "intersection" ? type.types : [type];
  return intersectionOf([...parts, unevaluated]);
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
