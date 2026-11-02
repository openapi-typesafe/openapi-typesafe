import { pathItemType } from "../application/transform/document/path-item.js";
import type { IrType } from "../domain/ir/nodes.js";
import type { HttpMethod } from "../domain/openapi/path-item-object.js";
import { createTransformContext, schemaLocation } from "../lib/transform-context.js";
import type { PathItemObject, TransformNodeOptions } from "../types.js";

export type Method = HttpMethod;

/**
 * Transform PathItem nodes (4.8.9)
 * @see https://spec.openapis.org/oas/v3.1.0#path-item-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 5). Same name and parameters as the original;
 * returns IR (task 6.2). For the public API and for users who call it from callbacks.
 */
export default function transformPathItemObject(pathItem: PathItemObject, options: TransformNodeOptions): IrType {
  const context = createTransformContext(options.ctx);
  return pathItemType(pathItem, schemaLocation(options), context);
}
