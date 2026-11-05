import type { IrObjectType, IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { indexSignaturesOf, nameOf, propertiesOf } from "./type-resolution.js";

/**
 * What the `--path-params-as-types` overlap check knows about one type where another is expected.
 * `assignable` and `rejected` are proofs of what TypeScript decides (`strict`, without
 * `exactOptionalPropertyTypes`); `undecided` is a pair the check does not model, such as a utility
 * type or raw text. Only a rejection changes the output, so an undecided pair keeps the original.
 */
export type Assignability = "assignable" | "rejected" | "undecided";

/**
 * All of the relations: rejected when one is, assignable when each is. The relations are computed
 * lazily, so a rejection stops the rest.
 */
export function everyOf<T>(
  items: readonly T[],
  relate: (item: T, index: number) => Assignability,
): Assignability {
  let result: Assignability = "assignable";
  for (const [index, item] of items.entries()) {
    const each = relate(item, index);
    if (each === "rejected") {
      return "rejected";
    }
    if (each === "undecided") {
      result = "undecided";
    }
  }
  return result;
}

/** One of the relations: assignable when one is, rejected when each is. */
export function someOf<T>(items: readonly T[], relate: (item: T) => Assignability): Assignability {
  let result: Assignability = "rejected";
  for (const item of items) {
    const each = relate(item);
    if (each === "assignable") {
      return "assignable";
    }
    if (each === "undecided") {
      result = "undecided";
    }
  }
  return result;
}

/** Assignable when the condition holds, rejected when it does not. */
export function provenBy(condition: boolean): Assignability {
  return condition ? "assignable" : "rejected";
}

/**
 * The kinds of resolved types the check tells apart. A type of one kind is never assignable to a
 * type of another, except that a primitive or a list may fit an object type (`string` fits
 * `{ length: number }`), which the check models only in part. `opaque` is any type it cannot
 * read.
 */
type TypeCategory = "primitive" | "list" | "object" | "opaque";

function categoryOf(type: IrType): TypeCategory {
  switch (type.kind) {
    case "keyword":
    case "stringLiteral":
    case "numberLiteral":
    case "booleanLiteral":
      return "primitive";
    case "array":
    case "tuple":
    case "readonly":
      return "list";
    case "object":
      return "object";
    default:
      return "opaque";
  }
}

/** Keywords that are no object: `{}` rejects them under `strictNullChecks`. */
const NO_OBJECT_KEYWORDS: ReadonlySet<string> = new Set(["null", "undefined", "unknown", "never"]);

/**
 * The members of `ReadonlyArray` and `Array` in the TypeScript libraries up to ESNext. An object
 * type that needs a property of another name is no list; a numeric name may be a tuple element.
 */
const ARRAY_MEMBER_NAMES: ReadonlySet<string> = new Set([
  "length",
  "toString",
  "toLocaleString",
  "pop",
  "push",
  "concat",
  "join",
  "reverse",
  "shift",
  "slice",
  "sort",
  "splice",
  "unshift",
  "indexOf",
  "lastIndexOf",
  "every",
  "some",
  "forEach",
  "map",
  "filter",
  "reduce",
  "reduceRight",
  "find",
  "findIndex",
  "fill",
  "copyWithin",
  "entries",
  "keys",
  "values",
  "includes",
  "flatMap",
  "flat",
  "at",
  "findLast",
  "findLastIndex",
  "toReversed",
  "toSorted",
  "toSpliced",
  "with",
]);

const ARRAY_LENGTH = "length";
/** A tuple element's name: `"0"`, `"1"`. */
const ELEMENT_NAME_RE = /^\d+$/;

function isListMemberName(name: string): boolean {
  return ARRAY_MEMBER_NAMES.has(name) || ELEMENT_NAME_RE.test(name);
}

/**
 * Whether a list fits an object type. It does not when the object needs a property no list has
 * (TS2741), or when the object is a weak type and no list has one of its properties (TS2559).
 */
function listToObject(target: IrObjectType): Assignability {
  const properties = [...propertiesOf(target).values()];
  const isForeign = (property: IrPropertySignature) => !isListMemberName(nameOf(property));
  const needsForeign = properties.some((property) => !property.isOptional && isForeign(property));
  const isWeak =
    properties.length > 0 &&
    indexSignaturesOf(target).length === 0 &&
    properties.every((property) => property.isOptional);
  return needsForeign || (isWeak && properties.every(isForeign)) ? "rejected" : "undecided";
}

/**
 * Whether a primitive fits an object type: `null`, `undefined` and `unknown` never do; any other
 * may (`{}`, `{ length: number }`), which is not modelled.
 */
function primitiveToObject(source: IrType): Assignability {
  const isNoObject = source.kind === "keyword" && NO_OBJECT_KEYWORDS.has(source.keyword);
  return isNoObject ? "rejected" : "undecided";
}

/** An object type fits an array only with all of its members; `length` is the first it needs. */
function objectToList(source: IrObjectType): Assignability {
  return propertiesOf(source).has(ARRAY_LENGTH) ? "undecided" : "rejected";
}

/**
 * The relation of two types of different categories, or null when they are of the same one.
 * Primitive and list targets accept nothing of another category; see `TypeCategory`.
 */
export function crossCategoryRelation(source: IrType, target: IrType): Assignability | null {
  const from = categoryOf(source);
  const to = categoryOf(target);
  if (from === "opaque" || to === "opaque") {
    return "undecided";
  }
  if (from === to) {
    return null;
  }
  if (to !== "object") {
    return source.kind === "object" && to === "list" ? objectToList(source) : "rejected";
  }
  return from === "primitive" ? primitiveToObject(source) : listToObject(target as IrObjectType);
}

/** The keyword a literal type belongs to. */
const LITERAL_KEYWORDS = {
  stringLiteral: "string",
  numberLiteral: "number",
  booleanLiteral: "boolean",
} as const;

/**
 * The relation of two primitive types written differently (the same text is assignable). A
 * literal fits its keyword; any other pair is rejected: different keywords, different literals,
 * a keyword for a literal (`boolean` is `true | false`), and anything for `never`.
 */
export function primitiveRelation(source: IrType, target: IrType): Assignability {
  if (target.kind !== "keyword" || source.kind === "keyword") {
    return "rejected";
  }
  const keyword = (LITERAL_KEYWORDS as Partial<Record<IrType["kind"], string>>)[source.kind];
  return provenBy(keyword === target.keyword);
}
