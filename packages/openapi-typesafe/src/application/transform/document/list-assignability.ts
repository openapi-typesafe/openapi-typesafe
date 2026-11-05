import type { IrTupleElement, IrTupleType, IrType } from "../../../domain/ir/nodes.js";
import { type Assignability, everyOf } from "./assignability.js";

/**
 * How the `--path-params-as-types` overlap check relates two lists: arrays, tuples and their
 * `readonly` forms. `relate` compares two item types with the whole check.
 */

type Relate = (source: IrType, target: IrType) => Assignability;

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

function isRequired(element: IrTupleElement): boolean {
  return !element.isRest && !element.isOptional;
}

/** A tuple with a required element rejects an array, which may be empty. */
function arrayToTuple(target: IrTupleType): Assignability {
  return target.elements.some(isRequired) ? "rejected" : "undecided";
}

/** Tuples of the same shape compare element by element; fixed lengths must be the same. */
function relateTuples(source: IrTupleType, target: IrTupleType, relate: Relate): Assignability {
  if (source.elements.length !== target.elements.length) {
    const isFixed = source.elements.every(isRequired) && target.elements.every(isRequired);
    return isFixed ? "rejected" : "undecided";
  }
  return everyOf(source.elements, (element, index) => {
    const other = target.elements[index] as IrTupleElement;
    if (element.isRest !== other.isRest) {
      return "undecided";
    }
    // An optional element may be missing where the target requires one.
    if (element.isOptional && !other.isOptional) {
      return "rejected";
    }
    return relate(element.type, other.type);
  });
}

function relateMutableLists(source: IrType, target: IrType, relate: Relate): Assignability {
  if (source.kind === "array") {
    if (target.kind === "array") {
      return relate(source.element, target.element);
    }
    return target.kind === "tuple" ? arrayToTuple(target) : "undecided";
  }
  if (source.kind !== "tuple") {
    return "undecided";
  }
  if (target.kind === "array") {
    return everyOf(source.elements, (element) => relate(elementType(element), target.element));
  }
  return target.kind === "tuple" ? relateTuples(source, target, relate) : "undecided";
}

/** Whether one list type fits another. */
export function relateLists(source: IrType, target: IrType, relate: Relate): Assignability {
  if (source.kind === "readonly") {
    // A readonly array is no mutable array (TS4104); to a readonly target it is the same type.
    return target.kind === "readonly" ? relate(source.type, target.type) : "rejected";
  }
  if (target.kind === "readonly") {
    return relate(source, target.type);
  }
  return relateMutableLists(source, target, relate);
}
