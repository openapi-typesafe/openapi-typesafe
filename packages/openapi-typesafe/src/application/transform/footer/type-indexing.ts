import type { IrMember, IrTupleType, IrType } from "../../../domain/ir/nodes.js";
import type { TemplateShape } from "../document/template-key-match.js";
import {
  type Evaluated,
  type Evaluation,
  intersectionType,
  isNullish,
  MISSING,
  NEVER,
  OPAQUE,
  tupleAsArray,
  unionType,
} from "./evaluation.js";
import { flatParts, hasDisjointPrimitives } from "./intersection-parts.js";

const UNDEFINED: IrType = { kind: "keyword", keyword: "undefined" };

import { memberRead, type RawKeyTypes } from "./signature-index.js";
import { declaredFirst, isNeverIntersection, type TypeExpansion } from "./type-rules.js";

/**
 * Indexed access (`T["key"]`, `T[number]`) on the generated types, as TypeScript reads it, for
 * the evaluator of the `--enum-values` check (ADR-027).
 */

/** The part of the evaluator that indexed access uses. */
export interface IndexedTypes extends TypeExpansion {
  expand(value: Evaluated): Evaluation;
  index(value: Evaluated, index: IrType): Evaluation;
  /** The key types of the raw keys of templated paths (`signature-index.ts`). */
  readonly keyTypes: RawKeyTypes;
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
    case "tuple":
      return isNumberIndex(index) ? tupleIndex(types, owner, type, index) : builtInIndex(index);
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
  const keys = keyShapesOf(types, index);
  if (keys === UNKNOWN_KEY) {
    return OPAQUE;
  }
  if (keys === null) {
    // `string` or `number`: the generator writes only `[key: string]`, which both read. Without
    // it neither has a match (TS2537), named properties do not count.
    const signature = members.find((member) => member.kind === "indexSignature");
    return signature === undefined ? MISSING : flattened(types, owner, signature.type);
  }
  // `T[A | B]` is `T[A] | T[B]`; a key that reads several signatures reads their intersection.
  const found = keys.map((key): Evaluation => {
    const read = memberRead(members, key, types.keyTypes);
    if (read.kind !== "types") {
      return read;
    }
    // Without `exactOptionalPropertyTypes` an optional property may be `undefined` too, which
    // `FlattenedDeepRequired` drops again.
    const type = intersectionType(read.types);
    return flattened(types, owner, read.isOptional === true ? unionType([type, UNDEFINED]) : type);
  });
  const failed = found.find((member) => member.kind !== "type");
  if (failed !== undefined) {
    return found.find((member) => member.kind === "missing") ?? failed;
  }
  return { ...owner, type: unionType((found as Evaluated[]).map((member) => member.type)) };
}

const UNKNOWN_KEY = "unknown";

/**
 * The key types of an index: one text for a literal, the key types of the raw key the generator
 * writes for a templated path, null for `string` and `number`, and `unknown` for another raw key.
 */
function keyShapesOf(
  types: IndexedTypes,
  index: IrType,
): readonly TemplateShape[] | null | typeof UNKNOWN_KEY {
  const key = indexKey(index);
  if (key !== null) {
    return [{ texts: [key], types: [] }];
  }
  return index.kind === "raw" ? (types.keyTypes.get(index.text) ?? UNKNOWN_KEY) : null;
}

function partsIndex(
  types: IndexedTypes,
  owner: Evaluated,
  written: readonly IrType[],
  index: IrType,
): Evaluation {
  const parts = flatParts(types, owner, written);
  if (hasDisjointPrimitives(types, owner, parts) || isNeverIntersection(types, owner, parts)) {
    return { ...owner, type: NEVER };
  }
  const found = parts.map((type) => types.index({ ...owner, type }, index));
  if (found.some((part) => part.kind === "opaque") || isArrayMix(types, owner, parts, index)) {
    return OPAQUE;
  }
  const read = parts.map((type, at) => ({ type, found: found[at] as Evaluation }));
  const kept = declaredFirst(types, owner, indexKey(index), read).flatMap((part) =>
    part.kind === "type" ? [part.type] : [],
  );
  return kept.length === 0 ? MISSING : { ...owner, type: intersectionType(kept) };
}

type ArrayShape = "arrays" | "none" | "mixed";

/**
 * Whether the parts of an intersection give a key arrays in one part and other types in others
 * (`{ a?: X } & { a?: Y[] }`). `FlattenedDeepRequired` reads the intersected property, which an
 * array part makes an array, by `[number]` through every part, not part by part: not modelled.
 * A part that is only partly an array (`X | Y[]`) does not make the property an array, so with
 * no part that is all arrays the parts are read one by one, as TypeScript does. The parts are
 * read as `partsIndex` joins them (`declaredFirst`); `unknown` adds nothing to an intersection,
 * and a part whose key cannot be read outside `FlattenedDeepRequired` does not count.
 */
function isArrayMix(
  types: IndexedTypes,
  owner: Evaluated,
  parts: readonly IrType[],
  index: IrType,
): boolean {
  if (!owner.deep) {
    return false;
  }
  const shallow: Evaluated = { ...owner, deep: false };
  const read = parts.map((type) => ({ type, found: types.index({ ...shallow, type }, index) }));
  const shapes = declaredFirst(types, shallow, indexKey(index), read).flatMap((found) =>
    found.kind === "type" && !isUnknown(types, found) ? [arrayShape(types, found)] : [],
  );
  return shapes.includes("arrays") && (shapes.includes("mixed") || shapes.includes("none"));
}

/** `unknown`, also as an optional value: `unknown | undefined` is `unknown`. */
function isUnknown(types: IndexedTypes, value: Evaluated): boolean {
  const [only, ...more] = types.membersOf(value);
  return (
    more.length === 0 &&
    only?.kind === "type" &&
    only.type.kind === "keyword" &&
    only.type.keyword === "unknown"
  );
}

function arrayShape(types: IndexedTypes, value: Evaluated): ArrayShape {
  const members = types.membersOf(value);
  const present = members.filter((member) => member.kind !== "type" || !isNullish(member.type));
  const arrays = present.filter(
    (member) => member.kind === "type" && arrayElement(member.type) !== null,
  );
  if (arrays.length === 0) {
    return "none";
  }
  return arrays.length === present.length ? "arrays" : "mixed";
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
  if (present.some((candidate) => hasArrayPart(types, candidate))) {
    // An intersection with an array part is an array too, read by `[number]` through every
    // part (a string index signature, the characters of a string): not modelled.
    return OPAQUE;
  }
  const elements = present.map((candidate) => arrayElement(candidate.type));
  if (present.length > 0 && elements.every((element) => element !== null)) {
    return types.expand({ ...owner, type: unionType(elements as IrType[]) });
  }
  return { ...owner, type: unionType(present.map((candidate) => candidate.type)) };
}

/** Whether a member is an intersection with an array or a tuple part (`X & "c"[]`). */
function hasArrayPart(types: IndexedTypes, member: Evaluated): boolean {
  const { type } = member;
  if (type.kind !== "intersection") {
    return false;
  }
  return type.types.some((part) => {
    const expanded = types.expand({ ...member, type: part });
    return expanded.kind === "type" && arrayElement(expanded.type) !== null;
  });
}

/** The element of an expanded member; expanding already dropped `readonly`. */
function arrayElement(type: IrType): IrType | null {
  if (type.kind === "tuple") {
    return tupleItems(type);
  }
  return type.kind === "array" ? type.element : null;
}

/**
 * `T[0]` of a tuple is its first element (`FlattenedDeepRequired` makes an optional one
 * required); `T[number]` and a position at or after a rest element are all its items, and a
 * position past the end of a tuple without one has no element (TS2493).
 */
function tupleIndex(
  types: IndexedTypes,
  owner: Evaluated,
  tuple: IrTupleType,
  index: IrType,
): Evaluation {
  const key = indexKey(index);
  const restAt = tuple.elements.findIndex((element) => element.isRest);
  const position = key === null ? Number.NaN : Number(key);
  if (Number.isNaN(position) || (restAt !== -1 && position >= restAt)) {
    return flattened(types, owner, tupleItems(tuple));
  }
  const element = tuple.elements[position];
  return element === undefined ? MISSING : flattened(types, owner, element.type);
}

/** The union of a tuple's items; `expand` keeps only tuples that `tupleAsArray` reads. */
function tupleItems(tuple: IrTupleType): IrType {
  return tupleAsArray(tuple)?.element ?? NEVER;
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

function isStringIndex(index: IrType): boolean {
  return index.kind === "keyword" && index.keyword === "string";
}

/**
 * A key of a primitive or an array: a built-in member is opaque, any other key is missing. They
 * have no `[key: string]` signature, so `string` has no match either (TS2537); `number` reads the
 * characters of a string and the items of an array.
 */
function builtInIndex(index: IrType): Evaluation {
  if (isStringIndex(index)) {
    return MISSING;
  }
  const key = indexKey(index);
  const isBuiltIn = key === null || key in String.prototype || key in Array.prototype;
  return isBuiltIn || key in Number.prototype ? OPAQUE : MISSING;
}
