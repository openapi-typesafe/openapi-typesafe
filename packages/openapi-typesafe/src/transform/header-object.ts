import { headerType } from "../application/transform/document/header.js";
import type { IrType } from "../domain/ir/nodes.js";
import { createTransformContext, schemaLocation } from "../lib/transform-context.js";
import type { HeaderObject, TransformNodeOptions } from "../types.js";

/**
 * Transform HeaderObject nodes (4.8.21)
 * @see https://spec.openapis.org/oas/v3.1.0#header-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 3). Same name and parameters as the original;
 * returns IR (task 6.2). For the public API and for users who call it from callbacks.
 */
export default function transformHeaderObject(
  headerObject: HeaderObject,
  options: TransformNodeOptions,
): IrType {
  const context = createTransformContext(options.ctx);
  return headerType(headerObject, schemaLocation(options), context);
}
