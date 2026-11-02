import { transformSchema, transformSchemaShape } from "../application/transform/schema/schema-transform.js";
import type { IrType } from "../domain/ir/nodes.js";
import { createTransformContext, schemaLocation } from "../lib/transform-context.js";
import type { ReferenceObject, SchemaObject, TransformNodeOptions } from "../types.js";

/**
 * Transform SchemaObject nodes (4.8.24)
 * @see https://spec.openapis.org/oas/v3.1.0#schema-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 2): the work happens in
 * `application/transform/schema`; this keeps the original name and parameters, returning IR
 * (task 6.2), for the public API and for users who call it from callbacks.
 */
export default function transformSchemaObject(
  schemaObject: SchemaObject | ReferenceObject,
  options: TransformNodeOptions,
  fromAdditionalProperties = false,
): IrType {
  const context = createTransformContext(options.ctx);
  const location = schemaLocation(options);
  return transformSchema(schemaObject, location, context, fromAdditionalProperties);
}

/** Transform SchemaObjects without the `postTransform` callback at the top level. */
export function transformSchemaObjectWithComposition(
  schemaObject: SchemaObject | ReferenceObject,
  options: TransformNodeOptions,
  fromAdditionalProperties = false,
): IrType {
  const context = createTransformContext(options.ctx);
  const location = schemaLocation(options);
  return transformSchemaShape(schemaObject, location, context, fromAdditionalProperties);
}
