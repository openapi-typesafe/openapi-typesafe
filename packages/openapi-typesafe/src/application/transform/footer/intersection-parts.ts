import type { IrType } from "../../../domain/ir/nodes.js";
import { type Evaluated, isNullish } from "./evaluation.js";
import type { TypeExpansion } from "./type-rules.js";

/**
 * Intersections as TypeScript normalizes them before it reads a member: nested intersections are
 * one list of parts, and parts of different primitives make the whole intersection `never`.
 */

/**
 * The parts of an intersection with nested intersections spliced in: `(A & B) & C` is
 * `A & B & C`, so an index signature of `B` and the `Record<string, never>` of `C` meet as
 * parts of one intersection. A part that is a union stays one part.
 */
export function flatParts(
  types: TypeExpansion,
  value: Evaluated,
  parts: readonly IrType[],
): IrType[] {
  return parts.flatMap((part) => {
    const members = types.membersOf({ ...value, type: part });
    const [only] = members;
    if (members.length === 1 && only?.kind === "type" && only.type.kind === "intersection") {
      return flatParts(types, only, only.type.types);
    }
    return [part];
  });
}

const PRIMITIVE_KEYWORDS: ReadonlySet<string> = new Set([
  "string",
  "number",
  "boolean",
  "bigint",
  "symbol",
  "null",
  "undefined",
]);

/** The primitive a part's values all are (`string` for `"a"`), or null for another part. */
function primitiveOf(type: IrType): string | null {
  switch (type.kind) {
    case "stringLiteral":
      return "string";
    case "numberLiteral":
      return "number";
    case "booleanLiteral":
      return "boolean";
    case "keyword":
      return PRIMITIVE_KEYWORDS.has(type.keyword) ? type.keyword : null;
    default:
      return null;
  }
}

/**
 * Whether two parts are values of different primitives: `string & number` is `never`. A `never`
 * part needs no rule: indexing it reads `never`, which the other parts' reads join.
 */
export function hasDisjointPrimitives(
  types: TypeExpansion,
  value: Evaluated,
  parts: readonly IrType[],
): boolean {
  const primitives = parts.flatMap((part) => {
    const [only, ...more] = types.membersOf({ ...value, type: part });
    const primitive = more.length === 0 && only?.kind === "type" ? primitiveOf(only.type) : null;
    return primitive === null ? [] : [primitive];
  });
  return new Set(primitives).size > 1;
}

/**
 * Whether a member of a union holds no value but `null` or `undefined`: the keyword itself, or an
 * intersection with such a part, which is that keyword (`null & unknown`) or `never`
 * (`null & { a: X }`). `NonNullable` drops such a member either way.
 */
export function isNullishMember(types: TypeExpansion, member: Evaluated): boolean {
  const { type } = member;
  if (type.kind !== "intersection") {
    return isNullish(type);
  }
  return flatParts(types, member, type.types).some((part) => {
    const [only, ...more] = types.membersOf({ ...member, type: part });
    return more.length === 0 && only?.kind === "type" && isNullish(only.type);
  });
}
