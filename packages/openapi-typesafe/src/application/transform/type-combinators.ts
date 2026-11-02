import { irIntersection, irKeyword, irReference, irUnion } from "../../domain/ir/constructors.js";
import type { IrType } from "../../domain/ir/nodes.js";
import { dedupeTypes } from "../../domain/ir/normalize.js";
import { literalType } from "./literal-type.js";

/**
 * Type combinators with the original helper semantics (`tsUnion`, `tsIntersection`, `tsOmit`, …).
 * They are the only places where the transformers normalize types.
 */

/** `never` for no types, the type itself for one, else a de-duplicated union (`tsUnion`). */
export function unionOf(types: readonly IrType[]): IrType {
  if (types.length <= 1) {
    return types[0] ?? irKeyword("never");
  }
  return irUnion(dedupeTypes(types));
}

/** Like `unionOf`, for intersections (`tsIntersection`). */
export function intersectionOf(types: readonly IrType[]): IrType {
  if (types.length <= 1) {
    return types[0] ?? irKeyword("never");
  }
  return irIntersection(dedupeTypes(types));
}

/** `T | null` without de-duplication (`tsNullable`). */
export function nullableOf(types: readonly IrType[]): IrType {
  return irUnion([...types, irKeyword("null")]);
}

/** `Omit<T, "a" | "b">`; the key union is never collapsed or de-duplicated (`tsOmit`). */
export function omitKeys(type: IrType, keys: readonly string[]): IrType {
  return irReference("Omit", [type, irUnion(keys.map(literalType))]);
}

/** `WithRequired<T, "a" | "b">`, or the type itself for no keys (`tsWithRequired`). */
export function withRequiredKeys(type: IrType, keys: readonly string[]): IrType {
  if (keys.length === 0) {
    return type;
  }
  return irReference("WithRequired", [type, unionOf(keys.map(literalType))]);
}

/** Primitive keywords, as the original `tsIsPrimitive` defines them (the null literal included). */
const PRIMITIVE_KEYWORDS: ReadonlySet<string> = new Set([
  "boolean",
  "never",
  "null",
  "number",
  "string",
  "undefined",
]);

export function isPrimitiveType(type: IrType): boolean {
  return type.kind === "keyword" && PRIMITIVE_KEYWORDS.has(type.keyword);
}
