import { escapePointerSegment } from "./json-pointer.js";
import type { Schema, SchemaObject } from "./schema-object.js";

/**
 * A discriminator owner is either a parent that its members `allOf` (an object with the
 * discriminator property) or a union (`oneOf` / `anyOf` of the members). The generated type of a
 * union is a TypeScript union, so it cannot be used like a parent: `Omit<Union, "kind">` keeps
 * only the keys that every member has, and a member that intersects the union it belongs to
 * refers to itself (TS2502, upstream #1665).
 */

/** Resolves a `$ref` of the document; `undefined` when it points nowhere. */
export type ResolveSchemaRef = (ref: string) => unknown;

const UNION_KEYWORDS = ["oneOf", "anyOf"] as const;
const COMPOSITION_KEYWORDS = ["allOf", ...UNION_KEYWORDS] as const;

function isSchemaObject(value: unknown): value is SchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keywordItems(schema: SchemaObject, keywords: readonly string[]): readonly Schema[] {
  const record = schema as Readonly<Record<string, unknown>>;
  return keywords.flatMap((keyword) => {
    const items = record[keyword];
    return Array.isArray(items) ? (items as readonly Schema[]) : [];
  });
}

/** The `oneOf` and `anyOf` members of a schema; empty when it is not a union. */
export function unionMembers(schema: unknown): readonly Schema[] {
  return isSchemaObject(schema) ? keywordItems(schema, UNION_KEYWORDS) : [];
}

/** The schema at `ref` when it is a union (has `oneOf` or `anyOf` members), else undefined. */
export function unionAt(ref: string, resolve: ResolveSchemaRef): SchemaObject | undefined {
  const schema = resolve(ref);
  return isSchemaObject(schema) && unionMembers(schema).length > 0 ? schema : undefined;
}

/** What one search for a `$ref` has seen, so that a `$ref` cycle ends. */
interface Search {
  readonly target: string;
  readonly resolve: ResolveSchemaRef;
  readonly visited: Set<string>;
}

function reaches(schema: Schema, search: Search): boolean {
  if (!isSchemaObject(schema)) {
    return false;
  }
  const ref = (schema as { readonly $ref?: unknown }).$ref;
  if (typeof ref === "string") {
    if (ref === search.target) {
      return true;
    }
    if (search.visited.has(ref)) {
      return false;
    }
    search.visited.add(ref);
    return reaches(search.resolve(ref) as Schema, search);
  }
  return keywordItems(schema, COMPOSITION_KEYWORDS).some((item) => reaches(item, search));
}

/**
 * Whether the type of `union` contains the schema at `target` without an object in between: one
 * of its members is a `$ref` to it, or `allOf` / `oneOf` / `anyOf` such a `$ref`, at any depth.
 * Such a reference is resolved at once by TypeScript, unlike one in a property or an array.
 */
export function unionReaches(
  union: SchemaObject,
  target: string,
  resolve: ResolveSchemaRef,
): boolean {
  const search = { target, resolve, visited: new Set<string>() };
  return unionMembers(union).some((member) => reaches(member, search));
}

const COMPONENT_SCHEMAS = "#/components/schemas/";

/** A mapping value as a `$ref`: a bare name is a component schema's name. */
function mappingRef(target: unknown): string | undefined {
  if (typeof target !== "string") {
    return undefined;
  }
  return target.startsWith("#") ? target : `${COMPONENT_SCHEMAS}${escapePointerSegment(target)}`;
}

/** Whether the discriminator `mapping` of `union` names the schema at `target`. */
export function unionMaps(union: SchemaObject, target: string): boolean {
  const mapping = (union.discriminator as { readonly mapping?: unknown } | undefined)?.mapping;
  if (!isSchemaObject(mapping)) {
    return false;
  }
  return Object.values(mapping).some((value) => mappingRef(value) === target);
}

/**
 * Whether the schema at `target` is a member of `union`: the union's type contains it, or the
 * discriminator `mapping` names it, which gives it a value of the union as a member does.
 */
export function isUnionMember(
  union: SchemaObject,
  target: string,
  resolve: ResolveSchemaRef,
): boolean {
  return unionMaps(union, target) || unionReaches(union, target, resolve);
}
