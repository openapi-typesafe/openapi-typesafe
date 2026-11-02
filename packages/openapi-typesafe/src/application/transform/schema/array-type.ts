import { irArray, irReadonly, irTuple, irTupleElement } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import { UNKNOWN_TYPE } from "../shared-types.js";
import { unionOf } from "../type-combinators.js";
import type { SchemaRequest } from "./schema-rule.js";

/**
 * `--array-length` writes tuples only while the estimated number of tuple elements stays below
 * this; the original chose it as roughly where TypeScript starts to struggle with tuple inference.
 */
const MAX_LENGTH_TUPLE_ELEMENTS = 30;

function itemType(schema: SchemaObject, request: SchemaRequest): IrType {
  const { items } = schema;
  if (schema.prefixItems || Array.isArray(items)) {
    const prefixItems = schema.prefixItems ?? (items as SchemaObject[]);
    return irTuple(
      prefixItems.map((item) => irTupleElement(request.transformNested(item, request.location))),
    );
  }
  if (!items) {
    return UNKNOWN_TYPE;
  }
  const nested = request.transformNested(items as SchemaObject, request.location);
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
 * length 0 to `max - min` (not `min` to `max`), which Phase 7 may correct; it is kept here.
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

/** `type: array`, including tuples (`prefixItems`, array `items`) and `--array-length`. */
export function arrayType(schema: SchemaObject, request: SchemaRequest): IrType {
  const item = itemType(schema, request);
  const bounds = lengthBounds(schema);
  if (isLengthTupleWanted(bounds, request)) {
    return lengthTupleType(schema, item, bounds);
  }
  // A tuple or an array item is used as the array type itself.
  const type = item.kind === "tuple" || item.kind === "array" ? item : irArray(item);
  return request.context.options.immutable ? irReadonly(type) : type;
}
