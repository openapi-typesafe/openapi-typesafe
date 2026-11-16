import type { Evaluated, Evaluation } from "./evaluation.js";
import { flatParts, hasDisjointPrimitives } from "./intersection-parts.js";
import { isNeverIntersection, type TypeExpansion } from "./type-rules.js";

function isNeverMember(types: TypeExpansion, member: Evaluation): boolean {
  if (member.kind !== "type") {
    return false;
  }
  const { type } = member;
  if (type.kind === "keyword") {
    return type.keyword === "never";
  }
  if (type.kind !== "intersection") {
    return false;
  }
  const parts = flatParts(types, member, type.types);
  // `X & never` is `never`: a part without a value leaves the intersection none.
  const hasNeverPart = parts.some((part) => readsNever(types, { ...member, type: part }));
  return (
    hasNeverPart ||
    hasDisjointPrimitives(types, member, parts) ||
    isNeverIntersection(types, member, parts)
  );
}

/**
 * Whether an evaluated type surely has no value: every member is `never`, or an intersection
 * TypeScript reduces to `never`. A member the evaluator cannot read is no answer, so the type
 * then may have values.
 */
export function readsNever(types: TypeExpansion, value: Evaluated): boolean {
  return types.membersOf(value).every((member) => isNeverMember(types, member));
}
