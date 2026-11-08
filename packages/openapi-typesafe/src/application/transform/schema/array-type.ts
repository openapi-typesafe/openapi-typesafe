import {
  irArray,
  irOptionalTupleElement,
  irReadonly,
  irTuple,
  irTupleElement,
} from "../../../domain/ir/constructors.js";
import type { IrTupleElement, IrType } from "../../../domain/ir/nodes.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { unionOf } from "../type-combinators.js";
import type { SchemaRequest } from "./schema-rule.js";

/**
 * `--array-length` writes tuples only while the estimated number of tuple elements stays below
 * this; the original chose it as roughly where TypeScript starts to struggle with tuple inference.
 */
const MAX_LENGTH_TUPLE_ELEMENTS = 30;

/**
 * The tuple of `prefixItems` (or of an `items` list); null without either. The original closes a
 * `prefixItems` tuple and requires every element; the `prefix-items` fix does not.
 */
function prefixTupleType(schema: SchemaObject, request: SchemaRequest): IrType | null {
  const { items } = schema;
  if (schema.prefixItems && isPrefixItemsFixed(schema, request)) {
    return prefixItemsTupleType(schema.prefixItems, schema, request);
  }
  if (!schema.prefixItems && !Array.isArray(items)) {
    return null;
  }
  const prefixItems = schema.prefixItems ?? (items as SchemaObject[]);
  return irTuple(
    prefixItems.map((item) => irTupleElement(request.transformNested(item, request.location))),
  );
}

/** The type of the items after the prefix, or null when there may be none (`false`). */
function restItemType(schema: Schema, request: SchemaRequest): IrType | null {
  return schema === false ? null : request.transformNested(schema, request.location);
}

/**
 * The type of the items after a `prefixItems` tuple (JSON Schema 2020-12 §10.3.1): `items`, else
 * `unevaluatedItems`, which does not apply to the items `contains` matches, else any item. Null
 * when no item may follow. An `items` list is not a schema in 2020-12, so it allows any item.
 */
function prefixRestType(schema: SchemaObject, request: SchemaRequest): IrType | null {
  const { items, unevaluatedItems, contains } = schema;
  if (items !== undefined && !Array.isArray(items)) {
    return restItemType(items as Schema, request);
  }
  if (unevaluatedItems === undefined || items !== undefined) {
    return UNKNOWN_TYPE;
  }
  const unevaluated = restItemType(unevaluatedItems, request);
  const matched = contains === undefined ? null : restItemType(contains, request);
  const types = [unevaluated, matched].filter((type): type is IrType => type !== null);
  return types.length === 0 ? null : unionOf(types);
}

/**
 * The `prefix-items` tuple of `prefixItems`: an array may end before the prefix does, so the
 * elements from `minItems` on are optional (`T?`), and a rest element types the items after it.
 */
function prefixItemsTupleType(
  prefixItems: readonly Schema[],
  schema: SchemaObject,
  request: SchemaRequest,
): IrType {
  const { min } = lengthBounds(schema);
  const elements = prefixItems.map((item, index): IrTupleElement => {
    const type = request.transformNested(item, request.location);
    return index < min ? irTupleElement(type) : irOptionalTupleElement(type);
  });
  const rest = prefixRestType(schema, request);
  return irTuple(rest === null ? elements : [...elements, irTupleElement(irArray(rest), true)]);
}

function isPrefixItemsFixed(schema: SchemaObject, request: SchemaRequest): boolean {
  return schema.prefixItems !== undefined && request.context.options.fixes.has(FIX.PREFIX_ITEMS);
}

/** The type of one item; `unknown` without `items`. */
function singleItemType(schema: SchemaObject, request: SchemaRequest): IrType {
  const { items } = schema;
  return items ? request.transformNested(items as SchemaObject, request.location) : UNKNOWN_TYPE;
}

/**
 * The item type as the original returns it: a tuple stands for the whole array, and a nested
 * `type: array` item is wrapped in an array here already.
 */
function itemType(schema: SchemaObject, request: SchemaRequest): IrType {
  const tuple = prefixTupleType(schema, request);
  if (tuple !== null) {
    return tuple;
  }
  const { items } = schema;
  // Checked first: the `in` test below throws for `items: null`.
  if (!items) {
    return UNKNOWN_TYPE;
  }
  const nested = singleItemType(schema, request);
  const isNestedArray = typeof items === "object" && "type" in items && items.type === "array";
  return isNestedArray ? irArray(nested) : nested;
}

function repeat(type: IrType, count: number): IrType[] {
  return Array.from({ length: count }, () => type);
}

interface LengthBounds {
  readonly min: number;
  readonly max: number | undefined;
}

function lengthBounds(schema: SchemaObject): LengthBounds {
  const { minItems, maxItems } = schema;
  const min = typeof minItems === "number" && minItems >= 0 ? minItems : 0;
  const isMaxValid = typeof maxItems === "number" && maxItems >= 0 && min <= maxItems;
  return { min, max: isMaxValid ? maxItems : undefined };
}

/**
 * Tuples for `--array-length`, as the original builds them. With both bounds it emits tuples of
 * length 0 to `max - min` (not `min` to `max`); the `array-length-tuples` fix corrects it.
 */
function lengthTupleType(schema: SchemaObject, item: IrType, bounds: LengthBounds): IrType {
  const { min, max } = bounds;
  if (min === max) {
    return unionOf([irTuple(repeat(item, min).map((type) => irTupleElement(type)))]);
  }
  if ((schema.maxItems as number) > 0) {
    const lengths = Array.from({ length: Math.max(0, (max ?? 0) - min + 1) }, (_, index) => index);
    return unionOf(
      lengths.map((length) => irTuple(repeat(item, length).map((type) => irTupleElement(type)))),
    );
  }
  const elements = repeat(item, min).map((type) => irTupleElement(type));
  return irTuple([...elements, irTupleElement(irArray(item), true)]);
}

function isLengthTupleWanted(bounds: LengthBounds, request: SchemaRequest): boolean {
  const { min, max } = bounds;
  const estimatedSize = max === undefined ? min : (max * (max + 1) - min * (min - 1)) / 2;
  const hasBounds = min !== 0 || max !== undefined;
  return (
    request.context.options.arrayLength && hasBounds && estimatedSize < MAX_LENGTH_TUPLE_ELEMENTS
  );
}

/** Applies `--immutable` to one array or tuple type. */
type ArrayWrapper = (type: IrType) => IrType;

function tupleOf(item: IrType, length: number, isOpen: boolean): IrType {
  const elements = repeat(item, length).map((type) => irTupleElement(type));
  return irTuple(isOpen ? [...elements, irTupleElement(irArray(item), true)] : elements);
}

/** Tuples of every length from `min` to `max`; without `max`, `min` items and a rest element. */
function fixedLengthTupleType(item: IrType, bounds: LengthBounds, wrap: ArrayWrapper): IrType {
  const { min, max } = bounds;
  if (max === undefined) {
    return wrap(tupleOf(item, min, true));
  }
  const lengths = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return unionOf(lengths.map((length) => wrap(tupleOf(item, length, false))));
}

/**
 * `type: array` with `--array-length` and the `array-length-tuples` fix (#2048, #2330, #2546):
 * the tuples have `min` to `max` items, the item type is used as it is (a nested array stays one
 * level deep), a `prefixItems` tuple gets no length tuples around it, and `--immutable` makes
 * every tuple `readonly`.
 */
function fixedArrayType(schema: SchemaObject, request: SchemaRequest): IrType {
  const wrap: ArrayWrapper = (type) =>
    request.context.options.immutable ? irReadonly(type) : type;
  const tuple = prefixTupleType(schema, request);
  if (tuple !== null) {
    return wrap(tuple);
  }
  const item = singleItemType(schema, request);
  const bounds = lengthBounds(schema);
  return isLengthTupleWanted(bounds, request)
    ? fixedLengthTupleType(item, bounds, wrap)
    : wrap(irArray(item));
}

function isArrayLengthFixed(request: SchemaRequest): boolean {
  const { arrayLength, fixes } = request.context.options;
  return arrayLength && fixes.has(FIX.ARRAY_LENGTH_TUPLES);
}

/** `type: array`, including tuples (`prefixItems`, array `items`) and `--array-length`. */
export function arrayType(schema: SchemaObject, request: SchemaRequest): IrType {
  if (isArrayLengthFixed(request)) {
    return fixedArrayType(schema, request);
  }
  const item = itemType(schema, request);
  const bounds = lengthBounds(schema);
  // A `prefix-items` tuple has its own lengths, so `--array-length` adds no tuples around it.
  if (!isPrefixItemsFixed(schema, request) && isLengthTupleWanted(bounds, request)) {
    return lengthTupleType(schema, item, bounds);
  }
  // A tuple or an array item is used as the array type itself.
  const type = item.kind === "tuple" || item.kind === "array" ? item : irArray(item);
  return request.context.options.immutable ? irReadonly(type) : type;
}
