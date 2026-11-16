import { irKeyword, irReference } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { RefResolver, SchemaOptions } from "../schema/schema-context.js";
import { followLocated, isJsonObject } from "./located-node.js";
import type { RefPointer } from "./pointer-walk.js";
import { isOptionalProperty } from "./property-shape.js";
import { typedWalk } from "./typed-walk.js";

/**
 * A pointer to an optional property: `Owner["key"]` reads `T | undefined`, as TypeScript reads an
 * optional property, though the target's own type is `T`. With the `ref-pointers` fix the type
 * leaves the `undefined` out (`Exclude<Owner["key"], undefined>`); a schema type has no
 * `undefined` of its own, so that is the target's type (ADR-026).
 */

const PROPERTIES_KEYWORD = "properties";

function isOptionalTarget(pointer: RefPointer, options: SchemaOptions, refs: RefResolver) {
  const { segments } = pointer;
  if (segments.at(-2) !== PROPERTIES_KEYWORD) {
    return false;
  }
  const ownerPointer = { ...pointer, segments: segments.slice(0, -2) };
  const owner = typedWalk({ pointer: ownerPointer, options, refs });
  if (owner.kind !== "typed") {
    return false;
  }
  const located = followLocated(owner.walk, refs);
  const { node } = located;
  return (
    isJsonObject(node) && isOptionalProperty({ ...located, node }, segments.at(-1) ?? "", options)
  );
}

/** The pointer type without the `undefined` an optional target property adds. */
export function withoutOptionalUndefined(
  type: IrType,
  pointer: RefPointer,
  options: SchemaOptions,
  refs: RefResolver,
): IrType {
  return isOptionalTarget(pointer, options, refs)
    ? irReference("Exclude", [type, irKeyword("undefined")])
    : type;
}
