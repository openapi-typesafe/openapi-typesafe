import { createTransformContext } from "../api/transform-context.js";
import { componentsType } from "../application/transform/document/components.js";
import { renameTakenAliases } from "../application/transform/document/root-type-aliases.js";
import type { IrType, IrTypeAliasDeclaration } from "../domain/ir/nodes.js";
import { isEnumSchema, singularizeComponentKind } from "../domain/openapi/components-object.js";
import type { ComponentsObject, GlobalContext } from "../types.js";

export { isEnumSchema };

/** `requestBodies` → `requestBody`; other keys drop the final `s`. */
export const singularizeComponentKey = singularizeComponentKind;

/**
 * Transform the ComponentsObject (4.8.7)
 * @see https://spec.openapis.org/oas/latest.html#components-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 6). Same name and parameters as the original;
 * returns IR (task 6.2). For the public API: the `components` type, then the root type aliases.
 */
export default function transformComponentsObject(
  componentsObject: ComponentsObject,
  ctx: GlobalContext,
): (IrType | IrTypeAliasDeclaration)[] {
  const { type, rootTypes } = componentsType(componentsObject, createTransformContext(ctx));
  // No footer here: only the aliases the `root-type-numbering` fix keeps get numbers.
  return [type, ...renameTakenAliases(rootTypes, [])];
}
