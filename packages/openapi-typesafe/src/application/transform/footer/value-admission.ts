import type { IrType } from "../../../domain/ir/nodes.js";
import type { Evaluated } from "./evaluation.js";
import type { TypeEvaluator } from "./type-evaluation.js";

/** Whether a type of the generated types admits a listed enum value (ADR-027). */

export type Admission = "yes" | "no" | "opaque";

function literalAdmission(type: IrType, value: string | number): Admission {
  switch (type.kind) {
    case "stringLiteral":
    case "numberLiteral":
      return type.value === value ? "yes" : "no";
    case "booleanLiteral":
      return "no";
    case "keyword":
      if (type.keyword === "unknown") {
        return "yes";
      }
      return type.keyword === typeof value ? "yes" : "no";
    case "object":
      // `{}` (as in `string & {}`) admits every value but `null` and `undefined`.
      return type.members.length === 0 ? "yes" : "no";
    case "array":
    case "tuple":
      return "no";
    default:
      return "opaque";
  }
}

export function admission(
  evaluator: TypeEvaluator,
  value: Evaluated,
  item: string | number,
): Admission {
  const { type } = value;
  if (type.kind === "union" || type.kind === "intersection") {
    const parts = type.types.map((part) => {
      const expanded = evaluator.expand({ ...value, type: part });
      return expanded.kind === "type" ? admission(evaluator, expanded, item) : "opaque";
    });
    // A union admits a value one member admits; an intersection excludes one a part excludes.
    const decisive: Admission = type.kind === "union" ? "yes" : "no";
    if (parts.includes(decisive)) {
      return decisive;
    }
    return parts.includes("opaque") ? "opaque" : decisive === "yes" ? "no" : "yes";
  }
  return literalAdmission(type, item);
}

/**
 * Whether an `--enum-values` array fits a location whose members are all arrays or tuples, at
 * least one a tuple: the `ReadonlyArray` helper then is that array or tuple itself, so the values
 * must fit one member as a whole. An array member admits every value as its element; a tuple
 * member needs one value per element, each admitted at its position. Null where no member is a
 * tuple, or one is no array: the element check reads those.
 */
export function arrayFit(
  evaluator: TypeEvaluator,
  value: Evaluated,
  values: readonly (string | number)[],
): boolean | null {
  const members = evaluator.membersOf(value);
  const isArrayLike = (member: (typeof members)[number]) =>
    member.kind === "type" && (member.type.kind === "array" || member.type.kind === "tuple");
  if (!members.some((member) => member.kind === "type" && member.type.kind === "tuple")) {
    return null;
  }
  if (!members.every(isArrayLike)) {
    return members.some((member) => member.kind !== "type") ? false : null;
  }
  return (members as Evaluated[]).some((member) => memberFits(evaluator, member, values));
}

function memberFits(
  evaluator: TypeEvaluator,
  member: Evaluated,
  values: readonly (string | number)[],
): boolean {
  const { type } = member;
  if (type.kind === "tuple" && type.elements.some((e) => e.isRest || e.isOptional)) {
    // Where the values may sit in a tuple with optional or rest elements is not modelled.
    return false;
  }
  if (type.kind === "tuple" && type.elements.length !== values.length) {
    return false;
  }
  return values.every((item, position) => {
    const index: IrType =
      type.kind === "tuple"
        ? { kind: "numberLiteral", value: position }
        : { kind: "keyword", keyword: "number" };
    const element = evaluator.index(member, index);
    return element.kind === "type" && admission(evaluator, element, item) === "yes";
  });
}
