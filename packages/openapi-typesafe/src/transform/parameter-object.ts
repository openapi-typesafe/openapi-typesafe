import { createTransformContext, schemaLocation } from "../api/transform-context.js";
import { parameterType } from "../application/transform/document/parameter.js";
import type { IrType } from "../domain/ir/nodes.js";
import type { ParameterObject, TransformNodeOptions } from "../types.js";

/**
 * Transform ParameterObject nodes (4.8.12)
 * @see https://spec.openapis.org/oas/v3.1.0#parameter-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 3). Same name and parameters as the original;
 * returns IR (task 6.2). For the public API and for users who call it from callbacks.
 */
export default function transformParameterObject(
  parameterObject: ParameterObject,
  options: TransformNodeOptions,
): IrType {
  const context = createTransformContext(options.ctx);
  return parameterType(parameterObject, schemaLocation(options), context);
}
