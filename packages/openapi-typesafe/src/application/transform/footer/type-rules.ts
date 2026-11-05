import type {
  IrMember,
  IrObjectType,
  IrPropertySignature,
  IrType,
} from "../../../domain/ir/nodes.js";
import {
  type Evaluated,
  type Evaluation,
  MISSING,
  OPAQUE,
  propertyKey,
  unionType,
} from "./evaluation.js";

/**
 * Rules of TypeScript about intersections, `Omit` and `Extract` that the `--enum-values` check
 * needs (ADR-027). They read the types as written, before `FlattenedDeepRequired`.
 */

/** The part of the evaluator these rules use. */
export interface TypeExpansion {
  expand(value: Evaluated): Evaluation;
  membersOf(value: Evaluated): readonly Evaluation[];
}

/** A unit value of a type: a literal, `null` or `undefined`. */
type Unit = string;

/**
 * The parts an intersection is made of, nested intersections flattened: each object type, or
 * `null` for a part that is not one.
 */
function objectParts(
  types: TypeExpansion,
  value: Evaluated,
  parts: readonly IrType[],
): (IrObjectType | null)[] {
  return parts.flatMap((part) => {
    const members = types.membersOf({ ...value, type: part });
    const [only] = members;
    if (members.length !== 1 || only?.kind !== "type") {
      return [null];
    }
    if (only.type.kind === "intersection") {
      return objectParts(types, only, only.type.types);
    }
    return [only.type.kind === "object" ? only.type : null];
  });
}

function unitOf(type: IrType): Unit | null {
  switch (type.kind) {
    case "stringLiteral":
      return `s:${type.value}`;
    case "numberLiteral":
      return `n:${type.value}`;
    case "booleanLiteral":
      return `b:${type.value}`;
    case "keyword":
      return type.keyword === "null" || type.keyword === "undefined" ? type.keyword : null;
    default:
      return null;
  }
}

/** The unit values of a type made only of units, or `null` where it has other values. */
function unitsOf(types: TypeExpansion, value: Evaluated, type: IrType): ReadonlySet<Unit> | null {
  const units = types.membersOf({ ...value, type }).map((member) => {
    return member.kind === "type" ? unitOf(member.type) : null;
  });
  return units.includes(null) ? null : new Set(units as Unit[]);
}

function propertiesNamed(objects: readonly IrObjectType[], key: string): IrPropertySignature[] {
  return objects.flatMap((object) => {
    const members: readonly IrMember[] = object.members;
    return members.filter(
      (member): member is IrPropertySignature =>
        member.kind === "property" && propertyKey(member.name) === key,
    );
  });
}

/** Whether properties of the same name share no unit value, one of them required. */
function isNeverProperty(
  types: TypeExpansion,
  value: Evaluated,
  found: IrPropertySignature[],
): boolean {
  if (found.length < 2 || found.every((property) => property.isOptional)) {
    return false;
  }
  const sets = found.map((property) => unitsOf(types, value, property.type));
  if (sets.includes(null)) {
    return false;
  }
  const [first, ...rest] = sets as ReadonlySet<Unit>[];
  const shared = [...(first ?? [])].filter((unit) => rest.every((set) => set.has(unit)));
  return shared.length === 0;
}

/** Whether an intersection has `null` or `undefined` next to an object: `null & { a: 1 }`. */
function isNullishObject(types: TypeExpansion, value: Evaluated, parts: readonly IrType[]) {
  const singles = parts.map((part) => {
    const members = types.membersOf({ ...value, type: part });
    const [only] = members;
    return members.length === 1 && only?.kind === "type" ? only.type : null;
  });
  const isNullish = (type: IrType | null) =>
    type?.kind === "keyword" && (type.keyword === "null" || type.keyword === "undefined");
  return singles.some(isNullish) && singles.some((type) => type?.kind === "object");
}

/**
 * Whether TypeScript reduces an intersection to `never`: `null` or `undefined` meets an object,
 * or objects share a property with literal types that have no value in common, one of them
 * requiring it (`{ a: "x" } & { a: "y" }`). Other properties are left alone, so the answer is
 * sure where it is yes.
 */
export function isNeverIntersection(
  types: TypeExpansion,
  value: Evaluated,
  parts: readonly IrType[],
): boolean {
  if (isNullishObject(types, value, parts)) {
    return true;
  }
  const objects = objectParts(types, value, parts).filter((part) => part !== null);
  if (objects.length < 2) {
    return false;
  }
  const keys = new Set(
    objects.flatMap((object) =>
      object.members.flatMap((member) =>
        member.kind === "property" ? [propertyKey(member.name)] : [],
      ),
    ),
  );
  const valueOfKeys = { ...value, deep: false };
  return [...keys].some((key) =>
    isNeverProperty(types, valueOfKeys, propertiesNamed(objects, key)),
  );
}

type Presence = "yes" | "no" | "opaque";

/**
 * Whether a type has `key` as a property that `{ key: unknown }` accepts: written and, outside
 * `FlattenedDeepRequired`, required. An index signature does not count, as in TypeScript.
 */
function presenceOf(types: TypeExpansion, value: Evaluated, key: string): Presence {
  const { type } = value;
  if (type.kind === "intersection") {
    const parts = type.types.map((part) => {
      const expanded = types.expand({ ...value, type: part });
      return expanded.kind === "type" ? presenceOf(types, expanded, key) : "opaque";
    });
    return parts.includes("yes") ? "yes" : parts.includes("opaque") ? "opaque" : "no";
  }
  if (type.kind === "object") {
    const found = propertiesNamed([type], key);
    return found.some((property) => value.deep || !property.isOptional) ? "yes" : "no";
  }
  const isOther = ["keyword", "array", "stringLiteral", "numberLiteral", "booleanLiteral"];
  return isOther.includes(type.kind) ? "no" : "opaque";
}

/**
 * `Extract<T, { key: unknown }>`: the members of `T` that have `key`. When none has it the
 * result is `never`; it is `missing` here, as the location then types nothing.
 */
export function extracted(types: TypeExpansion, value: Evaluated, key: string): Evaluation {
  const members = types.membersOf(value);
  if (members.some((member) => member.kind !== "type")) {
    return OPAQUE;
  }
  const presence = (members as Evaluated[]).map((member) => presenceOf(types, member, key));
  if (presence.includes("opaque")) {
    return OPAQUE;
  }
  const kept = (members as Evaluated[]).filter((_, index) => presence[index] === "yes");
  if (kept.length === 0) {
    return MISSING;
  }
  return { ...value, type: unionType(kept.map((member) => member.type)) };
}

function omittedKeys(types: TypeExpansion, value: Evaluated, keys: IrType): Set<string> | null {
  const members = types.membersOf({ ...value, type: keys });
  const names = members.map((member) =>
    member.kind === "type" && member.type.kind === "stringLiteral" ? member.type.value : null,
  );
  return names.includes(null) ? null : new Set(names as string[]);
}

/** Whether two members name the same property: merging them would need their intersection. */
function hasSharedProperty(members: readonly IrMember[]): boolean {
  const names = members.flatMap((member) =>
    member.kind === "property" ? [propertyKey(member.name)] : [],
  );
  return new Set(names).size !== names.length;
}

/**
 * `Omit<T, K>` for literal keys `K` over an object or an intersection of objects. A string index
 * signature makes `keyof T` all strings, so only the index signatures are left.
 */
export function omitted(types: TypeExpansion, value: Evaluated, keys: IrType): Evaluation {
  const names = omittedKeys(types, value, keys);
  const objects = objectParts(types, value, [value.type]);
  if (names === null || objects.length === 0 || objects.includes(null)) {
    return OPAQUE;
  }
  const members = (objects as IrObjectType[]).flatMap((object) => object.members);
  if (hasSharedProperty(members)) {
    return OPAQUE;
  }
  const signatures = members.filter((member) => member.kind === "indexSignature");
  const kept =
    signatures.length > 0
      ? signatures
      : members.filter(
          (member) => member.kind !== "property" || !names.has(propertyKey(member.name)),
        );
  return { ...value, type: { kind: "object", members: kept } };
}
