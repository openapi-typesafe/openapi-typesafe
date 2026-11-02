import { responsesType } from "../application/transform/document/responses.js";
import type { IrType } from "../domain/ir/nodes.js";
import { createTransformContext, schemaLocation } from "../lib/transform-context.js";
import type { ResponsesObject, TransformNodeOptions } from "../types.js";

/**
 * Transform ResponsesObject nodes (4.8.16)
 * @see https://spec.openapis.org/oas/v3.1.0#responses-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 4). Same name and parameters as the original;
 * returns IR (task 6.2). For the public API and for users who call it from callbacks.
 */
export default function transformResponsesObject(
  responsesObject: ResponsesObject,
  options: TransformNodeOptions,
): IrType {
  const context = createTransformContext(options.ctx);
  return responsesType(responsesObject, schemaLocation(options), context);
}
