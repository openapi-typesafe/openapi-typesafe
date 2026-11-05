import { irObject, irProperty } from "../../../domain/ir/constructors.js";
import type {
  IrMember,
  IrObjectType,
  IrPropertySignature,
  IrType,
} from "../../../domain/ir/nodes.js";
import { toPropertyName } from "../../../domain/ir/property-name.js";
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
  // At least two properties, so at least two sets.
  const [first, ...rest] = sets as [ReadonlySet<Unit>, ...ReadonlySet<Unit>[]];
  const shared = [...first].filter((unit) => rest.every((set) => set.has(unit)));
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

/** Whether `key` reaches only an index signature of this object: it declares no such property. */
function isSignatureOnly(types: TypeExpansion, value: Evaluated, key: string | null): boolean {
  const members = types.membersOf(value);
  const [only] = members;
  if (
    key === null ||
    members.length !== 1 ||
    only?.kind !== "type" ||
    only.type.kind !== "object"
  ) {
    return false;
  }
  const { members: declared } = only.type;
  const hasSignature = declared.some((member) => member.kind === "indexSignature");
  return hasSignature && propertiesNamed([only.type], key).length === 0;
}

/**
 * The parts of an intersection indexed by `index`, as TypeScript reads them: where one part
 * declares the property, the index signatures of the others do not take part
 * (`{ a: X } & { [key: string]: Y }` gives `X` for `a`).
 */
export function declaredFirst(
  types: TypeExpansion,
  value: Evaluated,
  key: string | null,
  parts: readonly { readonly type: IrType; readonly found: Evaluation }[],
): Evaluation[] {
  const bySignature = parts.map(({ type }) => isSignatureOnly(types, { ...value, type }, key));
  const isDeclared = parts.some(({ found }, at) => found.kind === "type" && !bySignature[at]);
  return parts.filter((_, at) => !(isDeclared && bySignature[at])).map(({ found }) => found);
}

/**
 * Whether a member of `membersOf` has `key` as a property that `{ key: unknown }` accepts: written
 * and, outside `FlattenedDeepRequired`, required. An index signature does not count, as in
 * TypeScript. Such a member is expanded, parts included, so it is an object, an intersection of
 * members, or a primitive or array type, which has no such property; a type the evaluator cannot
 * read makes `membersOf` opaque instead.
 */
function hasKey(value: Evaluated, key: string): boolean {
  const { type } = value;
  if (type.kind === "intersection") {
    return type.types.some((part) => hasKey({ ...value, type: part }, key));
  }
  if (type.kind !== "object") {
    return false;
  }
  return propertiesNamed([type], key).some((property) => value.deep || !property.isOptional);
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
  const kept = (members as Evaluated[]).filter((member) => hasKey(member, key));
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

/** The `--read-write-markers` types and their one member (`READ_WRITE_MARKER_TYPES`). */
const READ_WRITE_MARKER_KEYS: ReadonlyMap<string, string> = new Map([
  ["$Read", "$read"],
  ["$Write", "$write"],
]);

/** `$Read<T>` is `{ readonly $read: T }`: an object, which holds no enum value. */
export function markerObject(name: string, argument: Evaluated): Evaluated | null {
  const key = READ_WRITE_MARKER_KEYS.get(name);
  if (key === undefined) {
    return null;
  }
  const member = irProperty(toPropertyName(key), argument.type, { isReadonly: true });
  return { ...argument, type: irObject([member]) };
}
