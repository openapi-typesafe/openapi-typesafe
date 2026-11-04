import type { ParameterObject } from "../../../domain/openapi/parameter-object.js";
import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import type { RefResolver } from "../schema/schema-context.js";

/**
 * Exploded object query parameters (OpenAPI 3.2 §4.8.12.4, upstream #2361). A query parameter has
 * `style: form` and, with it, `explode: true` by default. An object value is then sent as its own
 * `key=value` pairs, `?page=1&limit=10`: the parameter's name is not in the URL. So with the
 * `exploded-query-objects` fix, the object's properties are keys of `query`, not one key named
 * after the parameter.
 */

const FORM_STYLE = "form";

/** Whether a `$ref` chain has been followed already, so a cycle ends. */
type SeenRefs = ReadonlySet<string>;

function resolvedSchema(schema: Schema, refs: RefResolver, seen: SeenRefs): SchemaObject | null {
  if (typeof schema !== "object" || schema === null) {
    return null;
  }
  if (!("$ref" in schema)) {
    return schema;
  }
  if (seen.has(schema.$ref)) {
    return null;
  }
  const target = refs.resolve(schema.$ref) as Schema | undefined;
  return target === undefined
    ? null
    : resolvedSchema(target, refs, new Set([...seen, schema.$ref]));
}

/** The types of a `type` keyword other than `null`; empty when it has none. */
function nonNullTypes(schema: SchemaObject): readonly unknown[] {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  return types.filter((type) => type !== undefined && type !== null && type !== "null");
}

/** Whether every member of a composition is an object schema; false for an empty list. */
function isObjectComposition(
  members: readonly Schema[] | undefined,
  refs: RefResolver,
  seen: SeenRefs,
): boolean {
  return (
    members !== undefined &&
    members.length > 0 &&
    members.every((member) => isObjectSchemaWith(member, refs, seen))
  );
}

function isObjectSchemaWith(schema: Schema, refs: RefResolver, seen: SeenRefs): boolean {
  const resolved = resolvedSchema(schema, refs, seen);
  if (resolved === null) {
    return false;
  }
  const types = nonNullTypes(resolved);
  if (types.length > 0) {
    return types.every((type) => type === "object");
  }
  return (
    resolved.properties !== undefined ||
    resolved.additionalProperties !== undefined ||
    resolved.patternProperties !== undefined ||
    isObjectComposition(resolved.allOf, refs, seen) ||
    isObjectComposition(resolved.oneOf, refs, seen) ||
    isObjectComposition(resolved.anyOf, refs, seen)
  );
}

/**
 * Whether the schema describes only objects: `type: object` (with `null` or not), or no `type`
 * and object keywords, or a composition of such schemas. A `$ref` is followed.
 */
export function isObjectSchema(schema: Schema, refs: RefResolver): boolean {
  return isObjectSchemaWith(schema, refs, new Set());
}

/** Whether an `in: query` parameter sends its object value as the object's own keys. */
export function isExplodedQueryObject(parameter: ParameterObject, refs: RefResolver): boolean {
  const style = parameter.style ?? FORM_STYLE;
  const explode = parameter.explode ?? style === FORM_STYLE;
  return (
    parameter.in === "query" &&
    style === FORM_STYLE &&
    explode &&
    parameter.schema !== undefined &&
    isObjectSchema(parameter.schema, refs)
  );
}
