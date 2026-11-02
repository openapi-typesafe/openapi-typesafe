import type ts from "typescript";
import { toPropertySignature } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import { parametersMember } from "../application/transform/document/parameters.js";
import { createTransformContext, schemaLocation } from "../lib/transform-context.js";
import type { ParameterObject, ReferenceObject, TransformNodeOptions } from "../types.js";

/**
 * Synthetic type. Array of (ParameterObject | ReferenceObject)s found in OperationObject and
 * PathItemObject.
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 3); this keeps the original signature for the
 * deep imports of this module.
 */
export function transformParametersArray(
  parametersArray: (ParameterObject | ReferenceObject)[],
  options: TransformNodeOptions,
): ts.TypeElement[] {
  const context = createTransformContext(options.ctx);
  return [toPropertySignature(parametersMember(parametersArray, schemaLocation(options), context))];
}
