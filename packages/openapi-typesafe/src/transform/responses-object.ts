import type ts from "typescript";
import { responsesType } from "../application/transform/document/responses.js";
import { createTransformContext, schemaLocation, toLegacyType } from "../lib/transform-context.js";
import type { ResponsesObject, TransformNodeOptions } from "../types.js";

/**
 * Transform ResponsesObject nodes (4.8.16)
 * @see https://spec.openapis.org/oas/v3.1.0#responses-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 4); this keeps the original signature for the
 * public API and for users who call it from callbacks.
 */
export default function transformResponsesObject(
  responsesObject: ResponsesObject,
  options: TransformNodeOptions,
): ts.TypeNode {
  const context = createTransformContext(options.ctx);
  return toLegacyType(responsesType(responsesObject, schemaLocation(options), context));
}
