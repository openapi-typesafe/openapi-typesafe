import { requestBodyType } from "../application/transform/document/request-body.js";
import type { IrType } from "../domain/ir/nodes.js";
import { createTransformContext, schemaLocation } from "../lib/transform-context.js";
import type { RequestBodyObject, TransformNodeOptions } from "../types.js";

/**
 * Transform RequestBodyObject nodes (4.8.13)
 * @see https://spec.openapis.org/oas/v3.1.0#request-body-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 4). Same name and parameters as the original;
 * returns IR (task 6.2). For the public API and for users who call it from callbacks.
 */
export default function transformRequestBodyObject(
  requestBodyObject: RequestBodyObject,
  options: TransformNodeOptions,
): IrType {
  const context = createTransformContext(options.ctx);
  return requestBodyType(requestBodyObject, schemaLocation(options), context);
}
