import type { Schema, SchemaObject } from "../../../domain/openapi/schema-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import type { SchemaOptions } from "./schema-context.js";

/**
 * Whether `unevaluatedProperties` applies. It types the keys left over at this level, so it
 * does nothing next to `additionalProperties` (which already types them all), and only an object
 * schema has keys. A `type` list is typed one listed type at a time, so its object gets it.
 * The `$ref` pointer walk reads it too, to know whether the keyword is in the type.
 */
export function unevaluatedSchemaOf(schema: SchemaObject, options: SchemaOptions): Schema | null {
  const { unevaluatedProperties } = schema;
  if (
    !options.fixes.has(FIX.UNEVALUATED_PROPERTIES) ||
    unevaluatedProperties === undefined ||
    unevaluatedProperties === false ||
    schema.additionalProperties !== undefined
  ) {
    return null;
  }
  return schema.type === undefined || schema.type === "object" ? unevaluatedProperties : null;
}
