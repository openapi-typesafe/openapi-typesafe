import type { IrMember, IrPropertySignature, IrType } from "../../../domain/ir/nodes.js";
import { type DeclaredTypeLookup, NO_DECLARED_TYPES } from "./declared-types.js";

/**
 * Whether TypeScript surely rejects a covered path item for the index signature that covers it
 * (roadmap R10.2). The original output compiles when every covered type is assignable to the
 * signature's type, and that output must stay the same, so a signature is only moved when this
 * check proves the error. It compares object types property by property, as the checker does: a
 * property the signature needs and the covered type may lack, or a value where the signature has
 * the `?: never` of an empty slot (a missing method, an empty parameter location), proves it. Two
 * object properties are compared the same way, inside. A reference to a declaration of the
 * document (`operations["getApp"]`, `components["schemas"]["App"]`) is compared as the type it
 * names, when the lookup knows it (upstream #1752). Any other pair of types (unions, keywords,
 * unknown references) decides nothing, and that output is left as it was.
 */

/**
 * How a property is written. `never` is the `?: never` of an empty slot; a required `never`
 * (assignable to every type) is `unknown` and decides nothing.
 */
type Presence = "absent" | "never" | "optional" | "required" | "unknown";

function nameOf(member: IrPropertySignature): string {
  return member.name.kind === "string" ? member.name.value : member.name.text;
}

/** The type a reference names, followed through references to references. */
function declaredType(type: IrType, lookup: DeclaredTypeLookup): IrType {
  const seen = new Set<IrType>();
  let current = type;
  while (!seen.has(current)) {
    seen.add(current);
    const named = lookup(current);
    if (named === null) {
      return current;
    }
    current = named;
  }
  return current;
}

function presenceOf(member: IrPropertySignature | undefined, lookup: DeclaredTypeLookup): Presence {
  if (member === undefined) {
    return "absent";
  }
  const type = declaredType(member.type, lookup);
  if (type.kind === "keyword" && type.keyword === "never") {
    return member.isOptional ? "never" : "unknown";
  }
  return member.isOptional ? "optional" : "required";
}

/**
 * The presence of a covered property. A value that may be `undefined` (the keyword, or raw text
 * from a callback) fits an empty slot, so it is `unknown` and decides nothing.
 */
function coveredPresenceOf(
  member: IrPropertySignature | undefined,
  lookup: DeclaredTypeLookup,
): Presence {
  const type = member === undefined ? undefined : declaredType(member.type, lookup);
  const mayBeUndefined =
    type !== undefined &&
    ((type.kind === "keyword" && type.keyword === "undefined") || type.kind === "raw");
  return mayBeUndefined ? "unknown" : presenceOf(member, lookup);
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

/** Results by covered type, then by covering type. */
type PairResults = Map<IrType, Map<IrType, boolean>>;

function resultOf(results: PairResults, covered: IrType, covering: IrType): boolean | undefined {
  return results.get(covered)?.get(covering);
}

function setResult(results: PairResults, covered: IrType, covering: IrType, value: boolean): void {
  const byCovering = results.get(covered) ?? new Map<IrType, boolean>();
  byCovering.set(covering, value);
  results.set(covered, byCovering);
}

/**
 * The comparisons of one `paths` type. Many paths reference the same operations and schemas, so
 * each pair of types is compared once. A pair that is being compared already decides nothing: a
 * recursive type is rejected only by a property that differs before it repeats. A result reached
 * that way may miss a rejection, which only keeps the original output; a rejection is always
 * proven by a property, so caching it is safe.
 */
class PathItemComparison {
  private readonly lookup: DeclaredTypeLookup;
  private readonly inProgress: PairResults = new Map();
  private readonly results: PairResults = new Map();

  constructor(lookup: DeclaredTypeLookup) {
    this.lookup = lookup;
  }

  isRejected(covered: IrType, covering: IrType): boolean {
    const coveredType = declaredType(covered, this.lookup);
    const coveringType = declaredType(covering, this.lookup);
    if (coveredType === coveringType) {
      return false;
    }
    const known = resultOf(this.results, coveredType, coveringType);
    if (known !== undefined) {
      return known;
    }
    if (resultOf(this.inProgress, coveredType, coveringType) !== undefined) {
      return false;
    }
    setResult(this.inProgress, coveredType, coveringType, false);
    const result = this.isObjectRejected(coveredType, coveringType);
    this.inProgress.get(coveredType)?.delete(coveringType);
    setResult(this.results, coveredType, coveringType, result);
    return result;
  }

  private isObjectRejected(covered: IrType, covering: IrType): boolean {
    const coveredProperties = propertiesOf(covered);
    const coveringProperties = propertiesOf(covering);
    if (coveredProperties === null || coveringProperties === null) {
      return false;
    }
    return [...coveringProperties].some(([name, property]) =>
      this.isPropertyRejected(property, coveredProperties.get(name)),
    );
  }

  private isPropertyRejected(
    covering: IrPropertySignature,
    covered: IrPropertySignature | undefined,
  ): boolean {
    const covers = presenceOf(covering, this.lookup);
    if (isPresenceRejected(covers, coveredPresenceOf(covered, this.lookup))) {
      return true;
    }
    // A `never` is not an object type, so a slot that is empty on either side decides nothing.
    return covered !== undefined && this.isRejected(covered.type, covering.type);
  }
}

/** Whether a covered path item type is surely not assignable to a covering signature's type. */
export type PathItemRejection = (covered: IrType, covering: IrType) => boolean;

/** One comparison for all the path items of a `paths` type, which shares its results. */
export function pathItemRejection(
  lookup: DeclaredTypeLookup = NO_DECLARED_TYPES,
): PathItemRejection {
  const comparison = new PathItemComparison(lookup);
  return (covered, covering) => comparison.isRejected(covered, covering);
}

/**
 * Whether the covered type is surely not assignable to the covering signature's type. Without a
 * lookup, references decide nothing.
 */
export function isCoveredPathItemRejected(
  covered: IrType,
  covering: IrType,
  lookup: DeclaredTypeLookup = NO_DECLARED_TYPES,
): boolean {
  return pathItemRejection(lookup)(covered, covering);
}
