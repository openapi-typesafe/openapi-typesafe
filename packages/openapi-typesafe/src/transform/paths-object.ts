import { pathsType } from "../application/transform/document/paths.js";
import type { IrType } from "../domain/ir/nodes.js";
import { createTransformContext } from "../lib/transform-context.js";
import type { GlobalContext, PathsObject } from "../types.js";

/**
 * Transform the PathsObject node (4.8.8)
 * @see https://spec.openapis.org/oas/v3.1.0#operation-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 5). Same name and parameters as the original;
 * returns IR (task 6.2). For the public API and for users who call it from callbacks.
 */
export default function transformPathsObject(pathsObject: PathsObject, ctx: GlobalContext): IrType {
  return pathsType(pathsObject, createTransformContext(ctx));
}
