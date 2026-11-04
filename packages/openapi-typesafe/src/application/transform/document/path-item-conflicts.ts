import type { IrMember, IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";

/**
 * Whether TypeScript surely rejects a covered path item for the index signature that covers it
 * (roadmap R10.2). The original output compiles when every covered type is assignable to the
 * signature's type, and that output must stay the same, so a signature is only moved when this
 * check proves the error. It compares object types property by property, as the checker does: a
 * property the signature needs and the covered type may lack, or a value where the signature has
 * the `?: never` of an empty slot (a missing method, an empty parameter location), proves it. Two
 * object properties are compared the same way, inside. Any other pair of types (references,
 * unions, keywords) decides nothing, and that output is left as it was.
 */

/**
 * How a property is written. `never` is the `?: never` of an empty slot; a required `never`
 * (assignable to every type) is `unknown` and decides nothing.
 */
type Presence = "absent" | "never" | "optional" | "required" | "unknown";

function nameOf(member: IrPropertySignature): string {
  return member.name.kind === "string" ? member.name.value : member.name.text;
}

function presenceOf(member: IrPropertySignature | undefined): Presence {
  if (member === undefined) {
    return "absent";
  }
  if (member.type.kind === "keyword" && member.type.keyword === "never") {
    return member.isOptional ? "never" : "unknown";
  }
  return member.isOptional ? "optional" : "required";
}

function propertiesOf(type: IrType): ReadonlyMap<string, IrPropertySignature> | null {
  if (type.kind !== "object") {
    return null;
  }
  const properties = type.members.filter((member: IrMember): member is IrPropertySignature => {
    return member.kind === "property";
  });
  return new Map(properties.map((property) => [nameOf(property), property]));
}

/**
 * Whether the covered property's presence fails the signature's: a required value it may lack, or
 * a value where the signature has `never` (an object is not `undefined`).
 */
function isPresenceRejected(covering: Presence, covered: Presence): boolean {
  if (covered === "unknown") {
    return false;
  }
  if (covering === "required") {
    return covered !== "required";
  }
  return covering === "never" && (covered === "optional" || covered === "required");
}

function isPropertyRejected(
  covering: IrPropertySignature,
  covered: IrPropertySignature | undefined,
): boolean {
  if (isPresenceRejected(presenceOf(covering), presenceOf(covered))) {
    return true;
  }
  // A `never` is not an object type, so a slot that is empty on either side decides nothing here.
  return covered !== undefined && isCoveredPathItemRejected(covered.type, covering.type);
}

/** Whether the covered type is surely not assignable to the covering signature's type. */
export function isCoveredPathItemRejected(covered: IrType, covering: IrType): boolean {
  const coveredProperties = propertiesOf(covered);
  const coveringProperties = propertiesOf(covering);
  if (coveredProperties === null || coveringProperties === null) {
    return false;
  }
  return [...coveringProperties].some(([name, property]) =>
    isPropertyRejected(property, coveredProperties.get(name)),
  );
}
