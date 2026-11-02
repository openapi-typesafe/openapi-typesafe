import type ts from "typescript";
import { pathItemType } from "../application/transform/document/path-item.js";
import type { HttpMethod } from "../domain/openapi/path-item-object.js";
import { createTransformContext, schemaLocation, toLegacyType } from "../lib/transform-context.js";
import type { PathItemObject, TransformNodeOptions } from "../types.js";

export type Method = HttpMethod;

/**
 * Transform PathItem nodes (4.8.9)
 * @see https://spec.openapis.org/oas/v3.1.0#path-item-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 5); this keeps the original signature for the
 * public API and for users who call it from callbacks.
 */
export default function transformPathItemObject(pathItem: PathItemObject, options: TransformNodeOptions): ts.TypeNode {
  const context = createTransformContext(options.ctx);
  return toLegacyType(pathItemType(pathItem, schemaLocation(options), context));
}
