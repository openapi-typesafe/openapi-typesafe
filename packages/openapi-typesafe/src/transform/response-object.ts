import type ts from "typescript";
import { responseType } from "../application/transform/document/response.js";
import { createTransformContext, schemaLocation, toLegacyType } from "../lib/transform-context.js";
import type { ResponseObject, TransformNodeOptions } from "../types.js";

/**
 * Transform ResponseObject nodes (4.8.17)
 * @see https://spec.openapis.org/oas/v3.1.0#response-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 4); this keeps the original signature for the
 * unported parents and the public API.
 */
export default function transformResponseObject(
  responseObject: ResponseObject,
  options: TransformNodeOptions,
): ts.TypeNode {
  const context = createTransformContext(options.ctx);
  return toLegacyType(responseType(responseObject, schemaLocation(options), context));
}
