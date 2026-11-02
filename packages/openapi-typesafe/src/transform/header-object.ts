import type ts from "typescript";
import { headerType } from "../application/transform/document/header.js";
import { createTransformContext, schemaLocation, toLegacyType } from "../lib/transform-context.js";
import type { HeaderObject, TransformNodeOptions } from "../types.js";

/**
 * Transform HeaderObject nodes (4.8.21)
 * @see https://spec.openapis.org/oas/v3.1.0#header-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 3); this keeps the original signature for the
 * public API and for users who call it from callbacks.
 */
export default function transformHeaderObject(headerObject: HeaderObject, options: TransformNodeOptions): ts.TypeNode {
  const context = createTransformContext(options.ctx);
  return toLegacyType(headerType(headerObject, schemaLocation(options), context));
}
