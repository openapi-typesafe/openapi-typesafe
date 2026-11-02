import type ts from "typescript";
import { requestBodyType } from "../application/transform/document/request-body.js";
import { createTransformContext, schemaLocation, toLegacyType } from "../lib/transform-context.js";
import type { RequestBodyObject, TransformNodeOptions } from "../types.js";

/**
 * Transform RequestBodyObject nodes (4.8.13)
 * @see https://spec.openapis.org/oas/v3.1.0#request-body-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 4); this keeps the original signature for the
 * public API and for users who call it from callbacks.
 */
export default function transformRequestBodyObject(
  requestBodyObject: RequestBodyObject,
  options: TransformNodeOptions,
): ts.TypeNode {
  const context = createTransformContext(options.ctx);
  return toLegacyType(requestBodyType(requestBodyObject, schemaLocation(options), context));
}
