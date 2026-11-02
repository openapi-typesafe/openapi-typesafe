import type ts from "typescript";
import { pathsType } from "../application/transform/document/paths.js";
import { createTransformContext, toLegacyType } from "../lib/transform-context.js";
import type { GlobalContext, PathsObject } from "../types.js";

/**
 * Transform the PathsObject node (4.8.8)
 * @see https://spec.openapis.org/oas/v3.1.0#operation-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 5); this keeps the original signature for the
 * public API and for users who call it from callbacks.
 */
export default function transformPathsObject(pathsObject: PathsObject, ctx: GlobalContext): ts.TypeNode {
  return toLegacyType(pathsType(pathsObject, createTransformContext(ctx)));
}
