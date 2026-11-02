import type ts from "typescript";
import { toStatement, toTypeNode } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import { componentsType } from "../application/transform/document/components.js";
import { isEnumSchema, singularizeComponentKind } from "../domain/openapi/components-object.js";
import { createTransformContext } from "../lib/transform-context.js";
import type { ComponentsObject, GlobalContext } from "../types.js";

export { isEnumSchema };

/** `requestBodies` → `requestBody`; other keys drop the final `s`. */
export const singularizeComponentKey = singularizeComponentKind;

/**
 * Transform the ComponentsObject (4.8.7)
 * @see https://spec.openapis.org/oas/latest.html#components-object
 *
 * Ported to IR (ENGINEERING_PLAN Phase 5, step 6); this keeps the original signature for the
 * public API: the `components` type, then the root type aliases.
 */
export default function transformComponentsObject(componentsObject: ComponentsObject, ctx: GlobalContext): ts.Node[] {
  const { type, rootTypes } = componentsType(componentsObject, createTransformContext(ctx));
  return [toTypeNode(type), ...rootTypes.map(toStatement)];
}
