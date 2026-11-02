import type ts from "typescript";
import { toPropertySignature } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import { operationMembers } from "../application/transform/document/operation.js";
import { irObject, irProperty } from "../domain/ir/constructors.js";
import { toPropertyName } from "../domain/ir/property-name.js";
import { createTransformContext, schemaLocation } from "../lib/transform-context.js";
import type { OperationObject, TransformNodeOptions } from "../types.js";

/**
 * Transform OperationObject nodes (4.8.10)
 * @see https://spec.openapis.org/oas/v3.1.0#operation-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 5); this keeps the original signature for the
 * unported parents and the public API.
 */
export default function transformOperationObject(
  operationObject: OperationObject,
  options: TransformNodeOptions,
): ts.TypeElement[] {
  const context = createTransformContext(options.ctx);
  return operationMembers(operationObject, schemaLocation(options), context).map(toPropertySignature);
}

/** inject an operation at the top level */
export function injectOperationObject(
  operationId: string,
  operationObject: OperationObject,
  options: TransformNodeOptions,
): void {
  const context = createTransformContext(options.ctx);
  context.footer.addOperation(() => {
    const members = operationMembers(operationObject, schemaLocation(options), context);
    return irProperty(toPropertyName(operationId), irObject(members), {
      isReadonly: options.ctx.immutable,
    });
  });
}
