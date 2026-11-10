import { irKeyword, irReference } from "../../domain/ir/constructors.js";
import type { IrMember, IrType } from "../../domain/ir/nodes.js";
import { HELPER_TYPES } from "./helper-types.js";
import type { FooterDeclarations } from "./schema/schema-context.js";

/** The footer part that declares the `PropertyValues` helper type. */
export type PropertyValuesFooter = Pick<FooterDeclarations, "requirePropertyValues">;

function memberValueTypes(member: IrMember): IrType[] {
  if (member.kind === "indexSignature") {
    return [member.type];
  }
  return member.isOptional ? [member.type, irKeyword("undefined")] : [member.type];
}

/**
 * The value types a key of the type can have, read from its IR: the members of object types,
 * through unions and intersections. A reference (a `$ref`, `Omit`, `WithRequired`) or a raw
 * type is read with `PropertyValues`. Primitives, literals and arrays declare no keys.
 */
export function declaredValueTypes(type: IrType, footer: PropertyValuesFooter): IrType[] {
  switch (type.kind) {
    case "object":
      return type.members.flatMap(memberValueTypes);
    case "union":
    case "intersection":
      return type.types.flatMap((member) => declaredValueTypes(member, footer));
    case "reference":
    case "indexedAccess":
    case "raw":
      footer.requirePropertyValues();
      return [irReference(HELPER_TYPES.propertyValues.name, [type])];
    case "keyword":
    case "stringLiteral":
    case "numberLiteral":
    case "booleanLiteral":
    case "array":
    case "tuple":
    case "readonly":
      return [];
  }
}
