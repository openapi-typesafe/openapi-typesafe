import type ts from "typescript";
import { parameterType } from "../application/transform/document/parameter.js";
import { createTransformContext, schemaLocation, toLegacyType } from "../lib/transform-context.js";
import type { ParameterObject, TransformNodeOptions } from "../types.js";

/**
 * Transform ParameterObject nodes (4.8.12)
 * @see https://spec.openapis.org/oas/v3.1.0#parameter-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 3); this keeps the original signature for the
 * public API and for users who call it from callbacks.
 */
export default function transformParameterObject(
  parameterObject: ParameterObject,
  options: TransformNodeOptions,
): ts.TypeNode {
  const context = createTransformContext(options.ctx);
  return toLegacyType(parameterType(parameterObject, schemaLocation(options), context));
}
