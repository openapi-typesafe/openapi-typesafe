import type { IrMember, IrType } from "../../../domain/ir/nodes.js";
import {
  type Evaluated,
  type Evaluation,
  intersectionType,
  isNullish,
  MISSING,
  NEVER,
  OPAQUE,
  propertyKey,
  unionType,
} from "./evaluation.js";
import { declaredFirst, isNeverIntersection, type TypeExpansion } from "./type-rules.js";

/**
 * Indexed access (`T["key"]`, `T[number]`) on the generated types, as TypeScript reads it, for
 * the evaluator of the `--enum-values` check (ADR-027).
 */

/** The part of the evaluator that indexed access uses. */
export interface IndexedTypes extends TypeExpansion {
  expand(value: Evaluated): Evaluation;
  index(value: Evaluated, index: IrType): Evaluation;
}

/** `value[index]` for a string literal, `string` or `number` index. */
export function indexType(types: IndexedTypes, value: Evaluated, index: IrType): Evaluation {
  const owner = types.expand(value);
  if (owner.kind !== "type") {
    return owner;
  }
  if (types.membersOf(owner).length > 1) {
    return unionIndex(types, owner, index);
  }
  const { type } = owner;
  switch (type.kind) {
    case "object":
      return memberType(types, owner, type.members, index);
    case "intersection":
      return partsIndex(types, owner, type.types, index);
    case "union":
      return unionIndex(types, owner, index);
    case "array":
      return isNumberIndex(index) ? flattened(types, owner, type.element) : builtInIndex(index);
    case "keyword":
      return type.keyword === "never" ? owner : builtInIndex(index);
    default:
      return builtInIndex(index);
  }
}

function memberType(
  types: IndexedTypes,
  owner: Evaluated,
  members: readonly IrMember[],
  index: IrType,
): Evaluation {
  const key = indexKey(index);
  const property = members.find(
    (member) => member.kind === "property" && key !== null && propertyKey(member.name) === key,
  );
  if (property !== undefined) {
    return flattened(types, owner, property.type);
  }
  const signature = members.find((member) => member.kind === "indexSignature");
  if (signature !== undefined) {
    return flattened(types, owner, signature.type);
  }
  return key === null || isObjectBuiltIn(key) ? OPAQUE : MISSING;
}

function partsIndex(
  types: IndexedTypes,
  owner: Evaluated,
  parts: readonly IrType[],
  index: IrType,
): Evaluation {
  if (isNeverIntersection(types, owner, parts)) {
    return { ...owner, type: NEVER };
  }
  const found = parts.map((type) => types.index({ ...owner, type }, index));
  if (found.some((part) => part.kind === "opaque")) {
    return OPAQUE;
  }
  const read = parts.map((type, at) => ({ type, found: found[at] as Evaluation }));
  const kept = declaredFirst(types, owner, indexKey(index), read).flatMap((part) =>
    part.kind === "type" ? [part.type] : [],
  );
  return kept.length === 0 ? MISSING : { ...owner, type: intersectionType(kept) };
}

function unionIndex(types: IndexedTypes, owner: Evaluated, index: IrType): Evaluation {
  const found = types
    .membersOf(owner)
    .map((member) => (member.kind === "type" ? types.index(member, index) : member));
  if (found.some((member) => member.kind === "missing")) {
    return MISSING;
  }
  if (found.some((member) => member.kind === "opaque")) {
    return OPAQUE;
  }
  return { ...owner, type: unionType((found as Evaluated[]).map((member) => member.type)) };
}

/**
 * A member read through `FlattenedDeepRequired`: a value that is only arrays (and `undefined` or
 * `null`) is replaced by its elements, anything else loses `undefined` and `null`.
 */
function flattened(types: IndexedTypes, owner: Evaluated, type: IrType): Evaluation {
  const member: Evaluated = { ...owner, type };
  if (!owner.deep) {
    return types.expand(member);
  }
  const members = types.membersOf(member);
  if (members.some((candidate) => candidate.kind !== "type")) {
    return OPAQUE;
  }
  const present = (members as Evaluated[]).filter((candidate) => !isNullish(candidate.type));
  const elements = present.map((candidate) => arrayElement(candidate.type));
  if (present.length > 0 && elements.every((element) => element !== null)) {
    return types.expand({ ...owner, type: unionType(elements as IrType[]) });
  }
  return { ...owner, type: unionType(present.map((candidate) => candidate.type)) };
}

/** The element of an expanded member; expanding already dropped `readonly`. */
function arrayElement(type: IrType): IrType | null {
  return type.kind === "array" ? type.element : null;
}

function indexKey(index: IrType): string | null {
  if (index.kind === "stringLiteral") {
    return index.value;
  }
  return index.kind === "numberLiteral" ? String(index.value) : null;
}

function isNumberIndex(index: IrType): boolean {
  const key = indexKey(index);
  return (index.kind === "keyword" && index.keyword === "number") || /^\d+$/.test(key ?? "");
}

function isObjectBuiltIn(key: string): boolean {
  return key in {};
}

/** A key of a primitive or an array: a built-in member is opaque, any other key is missing. */
function builtInIndex(index: IrType): Evaluation {
  const key = indexKey(index);
  const isBuiltIn = key === null || key in String.prototype || key in Array.prototype;
  return isBuiltIn || key in Number.prototype ? OPAQUE : MISSING;
}
