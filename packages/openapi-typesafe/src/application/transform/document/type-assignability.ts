import type {
  IrIndexSignature,
  IrObjectType,
  IrPropertySignature,
  IrType,
  IrUnionType,
} from "../../../domain/ir/nodes.js";
import {
  type Assignability,
  crossCategoryRelation,
  everyOf,
  primitiveRelation,
  someOf,
} from "./assignability.js";
import type { DeclaredTypeLookup } from "./declared-types.js";
import { type IrListType, relateLists } from "./list-assignability.js";
import { createTypeKey } from "./type-key.js";
import {
  indexSignaturesOf,
  nameOf,
  propertiesOf,
  readType,
  TypeResolution,
} from "./type-resolution.js";

/**
 * Whether TypeScript accepts one type where another is expected (`strict`, without
 * `exactOptionalPropertyTypes`), for the `--path-params-as-types` overlap check. It follows the
 * checker's rules for the types the generator writes: unions, intersections, objects with optional
 * properties and index signatures, weak types, arrays, tuples, literals and keywords, and the
 * references to declarations of the document. A pair it does not model (a utility type, raw text)
 * is undecided unless both are the same type, and an undecided pair keeps the original output.
 */

/** Results by source type, then by target type. */
type PairResults = Map<IrType, Map<IrType, Assignability>>;

function resultOf(results: PairResults, source: IrType, target: IrType): Assignability | undefined {
  return results.get(source)?.get(target);
}

function setResult(
  results: PairResults,
  pair: { readonly source: IrType; readonly target: IrType },
  value: Assignability,
): void {
  const byTarget = results.get(pair.source) ?? new Map<IrType, Assignability>();
  byTarget.set(pair.target, value);
  results.set(pair.source, byTarget);
}

/** A weak type has only optional properties; TypeScript rejects a source sharing none (TS2559). */
function isWeakTypeRejected(source: IrObjectType, target: IrObjectType): boolean {
  const targetProperties = [...propertiesOf(target).values()];
  const isWeak =
    targetProperties.length > 0 &&
    indexSignaturesOf(target).length === 0 &&
    targetProperties.every((property) => property.isOptional);
  const sourceNames = [...propertiesOf(source).keys()];
  return (
    isWeak &&
    sourceNames.length > 0 &&
    !sourceNames.some((name) => targetProperties.some((property) => nameOf(property) === name))
  );
}

function isStringIndex(signature: IrIndexSignature): boolean {
  return signature.parameterType.kind === "keyword" && signature.parameterType.keyword === "string";
}

/** The memoized check over the declarations of one generated file. */
class AssignabilityCheck {
  private readonly inProgress: PairResults = new Map();
  private readonly results: PairResults = new Map();
  private readonly typeKeyOf = createTypeKey();
  private readonly resolution: TypeResolution;
  /** How often a pair being compared was assumed related, and how deep the comparison is. */
  private assumptions = 0;
  private depth = 0;

  constructor(lookup: DeclaredTypeLookup) {
    this.resolution = new TypeResolution(lookup);
  }

  relate(source: IrType, target: IrType): Assignability {
    const pair = {
      source: this.resolution.resolved(source),
      target: this.resolution.resolved(target),
    };
    if (
      pair.source === pair.target ||
      this.typeKeyOf(pair.source) === this.typeKeyOf(pair.target)
    ) {
      return "assignable";
    }
    const known = resultOf(this.results, pair.source, pair.target);
    if (known !== undefined) {
      return known;
    }
    // A pair being compared is assumed related, as the checker does for recursive types.
    if (resultOf(this.inProgress, pair.source, pair.target) !== undefined) {
      this.assumptions += 1;
      return "assignable";
    }
    const assumedBefore = this.assumptions;
    setResult(this.inProgress, pair, "assignable");
    this.depth += 1;
    const result = this.compare(pair.source, pair.target);
    this.depth -= 1;
    this.inProgress.get(pair.source)?.delete(pair.target);
    // "Assignable" that rests on an assumption about an outer pair holds only if that pair does,
    // so it is kept only once no outer pair is open. The assumption can only make a pair more
    // related, so a rejection or an undecided pair reached under it is safe to keep.
    if (result !== "assignable" || this.assumptions === assumedBefore || this.depth === 0) {
      setResult(this.results, pair, result);
    }
    return result;
  }

  private compare(source: IrType, target: IrType): Assignability {
    if (target.kind === "keyword" && target.keyword === "unknown") {
      return "assignable";
    }
    if (source.kind === "keyword" && source.keyword === "never") {
      return "assignable";
    }
    if (source.kind === "union") {
      return everyOf(source.types, (member) => this.relate(member, target));
    }
    if (target.kind === "intersection") {
      return everyOf(target.types, (member) => this.relateToIntersectionPart(source, member));
    }
    if (target.kind === "union") {
      return this.relateToUnion(source, target);
    }
    if (source.kind === "intersection") {
      // A part that fits is enough; the parts as one type are not modelled (see `merged`).
      const fits = source.types.some((part) => this.relate(part, target) === "assignable");
      return fits ? "assignable" : "undecided";
    }
    return this.compareSingle(source, target);
  }

  /**
   * A part of an intersection the check cannot merge into one object. The checker skips the weak
   * type check for such a part, so a rejection that may rest on it decides nothing.
   */
  private relateToIntersectionPart(source: IrType, part: IrType): Assignability {
    const result = this.relate(source, part);
    const from = this.resolution.resolved(source);
    const to = this.resolution.resolved(part);
    const isWeakRejection =
      from.kind === "object" && to.kind === "object" && isWeakTypeRejected(from, to);
    return result === "rejected" && isWeakRejection ? "undecided" : result;
  }

  /**
   * An object may fit a union of objects that none of its members accepts alone, through a
   * discriminant property (`{ k: "a" | "b" }` fits `{ k: "a" } | { k: "b" }`); not modelled.
   */
  private relateToUnion(source: IrType, target: IrUnionType): Assignability {
    const result = someOf(target.types, (member) => this.relate(source, member));
    const objectMembers = target.types.filter(
      (member) => this.resolution.resolved(member).kind === "object",
    );
    const mayBeDiscriminated = source.kind === "object" && objectMembers.length > 1;
    return result === "rejected" && mayBeDiscriminated ? "undecided" : result;
  }

  private compareSingle(source: IrType, target: IrType): Assignability {
    const crossCategory = crossCategoryRelation(source, target);
    if (crossCategory !== null) {
      return crossCategory;
    }
    switch (source.kind) {
      case "array":
      case "tuple":
      case "readonly":
        return relateLists(source, target as IrListType, (from, to) => this.relate(from, to));
      case "object":
        return this.relateObjects(source, target as IrObjectType);
      default:
        return primitiveRelation(source, target);
    }
  }

  private relateObjects(source: IrObjectType, target: IrObjectType): Assignability {
    if (isWeakTypeRejected(source, target)) {
      return "rejected";
    }
    const sourceProperties = propertiesOf(source);
    const indexes = everyOf(indexSignaturesOf(target), (signature) =>
      this.relateToIndex(source, signature),
    );
    if (indexes === "rejected") {
      return indexes;
    }
    const properties = everyOf([...propertiesOf(target).values()], (property) =>
      this.relateProperty(sourceProperties.get(nameOf(property)), property),
    );
    return everyOf([indexes, properties], (result) => result);
  }

  /**
   * A string index signature of the target. A string index of the source is compared with it;
   * without one, every property and index signature of the source is. An optional property is
   * compared without the `undefined` its optionality adds, as the checker does.
   */
  private relateToIndex(source: IrObjectType, signature: IrIndexSignature): Assignability {
    if (!isStringIndex(signature)) {
      return "undecided";
    }
    const indexes = indexSignaturesOf(source);
    const own = indexes.find(isStringIndex);
    if (own !== undefined) {
      return this.relate(own.type, signature.type);
    }
    const types = [
      ...[...propertiesOf(source).values()].map((property) => property.type),
      ...indexes.map((index) => index.type),
    ];
    return everyOf(types, (type) => this.relate(type, signature.type));
  }

  /**
   * A property of the target. A missing optional one is not checked, not even against a string
   * index of the source; a missing or optional source property fails a required one (TS2741).
   */
  private relateProperty(
    source: IrPropertySignature | undefined,
    target: IrPropertySignature,
  ): Assignability {
    if (source === undefined) {
      return target.isOptional ? "assignable" : "rejected";
    }
    if (source.isOptional && !target.isOptional) {
      return "rejected";
    }
    return this.relate(readType(source), readType(target));
  }
}

/** What the check proves about a source type where a target is expected. */
export type AssignabilityProof = (source: IrType, target: IrType) => Assignability;

/** One memoized check, for all the comparisons of a `paths` type. */
export function assignabilityProof(lookup: DeclaredTypeLookup): AssignabilityProof {
  const check = new AssignabilityCheck(lookup);
  return (source, target) => check.relate(source, target);
}
