import type {
  IrIndexSignature,
  IrObjectType,
  IrPropertySignature,
  IrTupleElement,
  IrType,
} from "../../../domain/ir/nodes.js";
import type { DeclaredTypeLookup } from "./declared-types.js";
import { createTypeKey } from "./type-key.js";
import {
  indexSignaturesOf,
  nameOf,
  propertiesOf,
  readType,
  TypeResolution,
} from "./type-resolution.js";

/**
 * Whether TypeScript surely accepts one type where another is expected (`strict`, without
 * `exactOptionalPropertyTypes`), for the `--path-params-as-types` overlap check. It follows the
 * checker's rules for the types the generator writes: unions, intersections, objects with optional
 * properties and index signatures, weak types, arrays, tuples, literals and keywords, and the
 * references to declarations of the document. `true` is a proof; `false` means "not proven":
 * a type it does not model (a utility type, raw text) is only accepted when it is the same type.
 * So a path item that is not proven assignable is moved to its own object, which always compiles.
 */

/** Results by source type, then by target type. */
type PairResults = Map<IrType, Map<IrType, boolean>>;

function resultOf(results: PairResults, source: IrType, target: IrType): boolean | undefined {
  return results.get(source)?.get(target);
}

function setResult(results: PairResults, source: IrType, target: IrType, value: boolean): void {
  const byTarget = results.get(source) ?? new Map<IrType, boolean>();
  byTarget.set(target, value);
  results.set(source, byTarget);
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

const UNDEFINED: IrType = { kind: "keyword", keyword: "undefined" };

/**
 * The type of a tuple element's items: a rest element `...T[]` stands for its items, and an
 * optional element `T?` may be `undefined` (`[string?]` is no `string[]` under `strict`).
 */
function elementType(element: IrTupleElement): IrType {
  if (element.isRest && element.type.kind === "array") {
    return element.type.element;
  }
  return element.isOptional ? { kind: "union", types: [element.type, UNDEFINED] } : element.type;
}

function isSameTupleShape(source: IrTupleElement, target: IrTupleElement): boolean {
  return (
    source.isRest === target.isRest &&
    (source.isOptional === target.isOptional || target.isOptional)
  );
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

  isAssignable(source: IrType, target: IrType): boolean {
    const from = this.resolution.resolved(source);
    const to = this.resolution.resolved(target);
    if (from === to || this.typeKeyOf(from) === this.typeKeyOf(to)) {
      return true;
    }
    const known = resultOf(this.results, from, to);
    if (known !== undefined) {
      return known;
    }
    // A pair being compared is assumed related, as the checker does for recursive types.
    if (resultOf(this.inProgress, from, to) !== undefined) {
      this.assumptions += 1;
      return true;
    }
    const assumedBefore = this.assumptions;
    setResult(this.inProgress, from, to, true);
    this.depth += 1;
    const result = this.compare(from, to);
    this.depth -= 1;
    this.inProgress.get(from)?.delete(to);
    // "Related" that rests on an assumption about an outer pair holds only if that pair does, so
    // it is kept only once no outer pair is open. "Not proven" never rests on an assumption.
    if (!result || this.assumptions === assumedBefore || this.depth === 0) {
      setResult(this.results, from, to, result);
    }
    return result;
  }

  private compare(source: IrType, target: IrType): boolean {
    if (target.kind === "keyword" && target.keyword === "unknown") {
      return true;
    }
    if (source.kind === "keyword" && source.keyword === "never") {
      return true;
    }
    if (source.kind === "union") {
      return source.types.every((member) => this.isAssignable(member, target));
    }
    if (target.kind === "intersection") {
      return target.types.every((member) => this.isAssignable(source, member));
    }
    if (
      target.kind === "union" &&
      target.types.some((member) => this.isAssignable(source, member))
    ) {
      return true;
    }
    if (source.kind === "intersection") {
      return this.isIntersectionAssignable(source.types, target);
    }
    return this.compareSingle(source, target);
  }

  /** A part of an intersection that is not one object (see `merged`) is enough when it fits. */
  private isIntersectionAssignable(parts: readonly IrType[], target: IrType): boolean {
    return parts.some((part) => this.isAssignable(part, target));
  }

  private compareSingle(source: IrType, target: IrType): boolean {
    if (source.kind === "readonly") {
      // A readonly array is no mutable array; to a readonly target it is the same type.
      return target.kind === "readonly" && this.isAssignable(source.type, target.type);
    }
    if (target.kind === "readonly") {
      return this.isAssignable(source, target.type);
    }
    switch (source.kind) {
      case "stringLiteral":
        return target.kind === "keyword" && target.keyword === "string";
      case "numberLiteral":
        return target.kind === "keyword" && target.keyword === "number";
      case "booleanLiteral":
        return target.kind === "keyword" && target.keyword === "boolean";
      case "array":
      case "tuple":
        return this.isListAssignable(source, target);
      case "object":
        return target.kind === "object" && this.isObjectAssignable(source, target);
      default:
        return false;
    }
  }

  private isListAssignable(source: IrType, target: IrType): boolean {
    if (source.kind === "array") {
      return target.kind === "array" && this.isAssignable(source.element, target.element);
    }
    if (source.kind !== "tuple") {
      return false;
    }
    if (target.kind === "array") {
      return source.elements.every((element) =>
        this.isAssignable(elementType(element), target.element),
      );
    }
    return (
      target.kind === "tuple" &&
      source.elements.length === target.elements.length &&
      source.elements.every((element, index) => {
        const other = target.elements[index] as IrTupleElement;
        return isSameTupleShape(element, other) && this.isAssignable(element.type, other.type);
      })
    );
  }

  private isObjectAssignable(source: IrObjectType, target: IrObjectType): boolean {
    if (isWeakTypeRejected(source, target)) {
      return false;
    }
    const sourceProperties = propertiesOf(source);
    const sourceIndexes = indexSignaturesOf(source);
    const targetIndexes = indexSignaturesOf(target);
    if (!targetIndexes.every((signature) => this.isIndexSatisfied(source, signature))) {
      return false;
    }
    return [...propertiesOf(target).values()].every((property) =>
      this.isPropertySatisfied(sourceProperties.get(nameOf(property)), property, sourceIndexes),
    );
  }

  /** Every property and string index of the source fits a string index signature of the target. */
  private isIndexSatisfied(source: IrObjectType, signature: IrIndexSignature): boolean {
    if (!isStringIndex(signature)) {
      return false;
    }
    const properties = [...propertiesOf(source).values()];
    return (
      properties.every((property) => this.isAssignable(readType(property), signature.type)) &&
      indexSignaturesOf(source).every(
        (own) => isStringIndex(own) && this.isAssignable(own.type, signature.type),
      )
    );
  }

  private isPropertySatisfied(
    source: IrPropertySignature | undefined,
    target: IrPropertySignature,
    sourceIndexes: readonly IrIndexSignature[],
  ): boolean {
    if (source === undefined) {
      // An optional property is checked against a string index of the source, if any.
      return (
        target.isOptional &&
        sourceIndexes.every(
          (own) => isStringIndex(own) && this.isAssignable(own.type, readType(target)),
        )
      );
    }
    if (source.isOptional && !target.isOptional) {
      return false;
    }
    return this.isAssignable(readType(source), readType(target));
  }
}

/** Whether a source type is surely assignable to a target, read through the document's types. */
export type AssignabilityProof = (source: IrType, target: IrType) => boolean;

/** One memoized check, for all the comparisons of a `paths` type. */
export function assignabilityProof(lookup: DeclaredTypeLookup): AssignabilityProof {
  const check = new AssignabilityCheck(lookup);
  return (source, target) => check.isAssignable(source, target);
}
