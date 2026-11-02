import { createTransformContext, schemaLocation } from "../api/transform-context.js";
import { mediaTypeType } from "../application/transform/document/media-type.js";
import type { IrType } from "../domain/ir/nodes.js";
import type { MediaTypeObject, TransformNodeOptions } from "../types.js";

/**
 * Transform MediaTypeObject nodes (4.8.14)
 * @see https://spec.openapis.org/oas/v3.1.0#media-type-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 3). Same name and parameters as the original;
 * returns IR (task 6.2). For the public API and for users who call it from callbacks.
 */
export default function transformMediaTypeObject(
  mediaTypeObject: MediaTypeObject,
  options: TransformNodeOptions,
): IrType {
  const context = createTransformContext(options.ctx);
  return mediaTypeType(mediaTypeObject, schemaLocation(options), context);
}
