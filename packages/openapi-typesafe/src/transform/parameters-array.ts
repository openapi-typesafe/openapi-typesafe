import { createTransformContext, schemaLocation } from "../api/transform-context.js";
import { parametersMember } from "../application/transform/document/parameters.js";
import type { IrMember } from "../domain/ir/nodes.js";
import type { ParameterObject, ReferenceObject, TransformNodeOptions } from "../types.js";

/**
 * Synthetic type. Array of (ParameterObject | ReferenceObject)s found in OperationObject and
 * PathItemObject.
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 3). Same name and parameters as the original;
 * returns IR (task 6.2). For the deep imports of this module.
 */
export function transformParametersArray(
  parametersArray: (ParameterObject | ReferenceObject)[],
  options: TransformNodeOptions,
): IrMember[] {
  const context = createTransformContext(options.ctx);
  return [parametersMember(parametersArray, schemaLocation(options), context)];
}
