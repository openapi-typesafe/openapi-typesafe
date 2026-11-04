import { unionAt, unionReaches } from "../../../domain/openapi/discriminated-union.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import type { SchemaRequest } from "./schema-rule.js";

/**
 * `allOf` items that are a `$ref` to a discriminated union (`oneOf` / `anyOf` and a
 * discriminator). Such an item cannot be typed as the parent of the inheritance pattern,
 * `Omit<Union, "kind">`.
 */

/**
 * The union at `ref` when its type contains the schema being transformed. Intersecting it would
 * make the schema refer to itself, which does not compile (TS2502, upstream #1665).
 */
export function containingUnion(ref: string, request: SchemaRequest): SchemaObject | undefined {
  const path = request.location.path;
  const resolve = (target: string) => request.context.refs.resolve(target);
  const union = unionAt(ref, resolve);
  return union !== undefined && path !== undefined && unionReaches(union, path, resolve)
    ? union
    : undefined;
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
}

/**
 * The keywords of a union that its members inherit: everything but the members and the
 * discriminator property, which each member redefines (as `Omit` does for a parent). The item's
 * `required` keys are added, as for an inline `allOf` item.
 */
export function unionOwnKeywords(
  union: SchemaObject,
  propertyName: string,
  required: readonly string[],
): SchemaObject {
  const { oneOf: _oneOf, anyOf: _anyOf, ...own } = union;
  const ownRequired = (union.required ?? []).filter((key) => key !== propertyName);
  return {
    ...own,
    ...(union.properties === undefined
      ? {}
      : { properties: withoutKey(union.properties, propertyName) }),
    required: [...required, ...ownRequired],
  };
}
