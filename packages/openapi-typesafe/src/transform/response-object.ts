import { responseType } from "../application/transform/document/response.js";
import type { IrType } from "../domain/ir/nodes.js";
import { createTransformContext, schemaLocation } from "../lib/transform-context.js";
import type { ResponseObject, TransformNodeOptions } from "../types.js";

/**
 * Transform ResponseObject nodes (4.8.17)
 * @see https://spec.openapis.org/oas/v3.1.0#response-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 4). Same name and parameters as the original;
 * returns IR (task 6.2). For the public API and for users who call it from callbacks.
 */
export default function transformResponseObject(
  responseObject: ResponseObject,
  options: TransformNodeOptions,
): IrType {
  const context = createTransformContext(options.ctx);
  return responseType(responseObject, schemaLocation(options), context);
}
