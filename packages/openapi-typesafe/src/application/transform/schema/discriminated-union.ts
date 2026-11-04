import { unionAt, unionReaches } from "../../../domain/openapi/discriminated-union.js";
import type { SchemaObject } from "../../../domain/openapi/schema-object.js";
import type { SchemaRequest } from "./schema-rule.js";

/**
 * `allOf` items that are a `$ref` to a discriminated union (`oneOf` / `anyOf` and a
 * discriminator). Such an item cannot be typed as the parent of the inheritance pattern,
 * `Omit<Union, "kind">`.
 */

/** The union an `allOf` item refers to, and whether the union's type contains this schema. */
export interface UnionItem {
  readonly union: SchemaObject;
  /**
   * The schema is one of the union's members: intersecting the union would make it refer to
   * itself, which does not compile (TS2502, upstream #1665).
   */
  readonly isMember: boolean;
}

/** The union at `ref`, if the schema there is one. */
export function unionItemOf(ref: string, request: SchemaRequest): UnionItem | undefined {
  const path = request.location.path;
  const resolve = (target: string) => request.context.refs.resolve(target);
  const union = unionAt(ref, resolve);
  if (union === undefined) {
    return undefined;
  }
  return { union, isMember: path !== undefined && unionReaches(union, path, resolve) };
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
