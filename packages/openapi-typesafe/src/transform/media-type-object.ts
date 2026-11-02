import type ts from "typescript";
import { mediaTypeType } from "../application/transform/document/media-type.js";
import { createTransformContext, schemaLocation, toLegacyType } from "../lib/transform-context.js";
import type { MediaTypeObject, TransformNodeOptions } from "../types.js";

/**
 * Transform MediaTypeObject nodes (4.8.14)
 * @see https://spec.openapis.org/oas/v3.1.0#media-type-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 3); this keeps the original signature for the
 * public API and for users who call it from callbacks.
 */
export default function transformMediaTypeObject(
  mediaTypeObject: MediaTypeObject,
  options: TransformNodeOptions,
): ts.TypeNode {
  const context = createTransformContext(options.ctx);
  return toLegacyType(mediaTypeType(mediaTypeObject, schemaLocation(options), context));
}
