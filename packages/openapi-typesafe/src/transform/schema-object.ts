import type ts from "typescript";
import { transformSchema, transformSchemaShape } from "../application/transform/schema/schema-transform.js";
import { createTransformContext, schemaLocation, toLegacyType } from "../lib/transform-context.js";
import type { ReferenceObject, SchemaObject, TransformNodeOptions } from "../types.js";

/**
 * Transform SchemaObject nodes (4.8.24)
 * @see https://spec.openapis.org/oas/v3.1.0#schema-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 2): the work happens in
 * `application/transform/schema`; this keeps the original signature for unported parents and for
 * users who call it from callbacks.
 */
export default function transformSchemaObject(
  schemaObject: SchemaObject | ReferenceObject,
  options: TransformNodeOptions,
  fromAdditionalProperties = false,
): ts.TypeNode {
  const context = createTransformContext(options.ctx);
  const location = schemaLocation(options);
  return toLegacyType(transformSchema(schemaObject, location, context, fromAdditionalProperties));
}

/** Transform SchemaObjects without the `postTransform` callback at the top level. */
export function transformSchemaObjectWithComposition(
  schemaObject: SchemaObject | ReferenceObject,
  options: TransformNodeOptions,
  fromAdditionalProperties = false,
): ts.TypeNode {
  const context = createTransformContext(options.ctx);
  const location = schemaLocation(options);
  return toLegacyType(transformSchemaShape(schemaObject, location, context, fromAdditionalProperties));
}
