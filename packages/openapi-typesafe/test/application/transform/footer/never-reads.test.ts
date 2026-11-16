import { describe, expect, it } from "vitest";
import { readsNever } from "../../../../src/application/transform/footer/never-reads.js";
import { TypeEvaluator } from "../../../../src/application/transform/footer/type-evaluation.js";
import {
  irIntersection,
  irKeyword,
  irObject,
  irProperty,
  irReference,
  irString,
  irUnion,
} from "../../../../src/domain/ir/constructors.js";
import type { IrType } from "../../../../src/domain/ir/nodes.js";

/** Whether the type a `$ref` pointer reads has no value (ADR-026). */

const evaluator = new TypeEvaluator([]);
const name = (value: string) => ({ kind: "identifier", text: value }) as const;
const EMAIL = irObject([irProperty(name("email"), irKeyword("string"))]);

function hasNoValue(type: IrType): boolean {
  return readsNever(evaluator, { kind: "type", type, deep: false });
}

describe("readsNever", () => {
  it.each([
    ["never", irKeyword("never")],
    ["a union of never members", irUnion([irKeyword("never"), irKeyword("never")])],
    [
      "an intersection of two primitives",
      irIntersection([irKeyword("string"), irKeyword("number")]),
    ],
    [
      "a nested intersection of two primitives",
      irIntersection([irKeyword("string"), irIntersection([irKeyword("number"), EMAIL])]),
    ],
    ["an object and null", irIntersection([EMAIL, irKeyword("null")])],
    ["an intersection with a never part", irIntersection([EMAIL, irUnion([irKeyword("never")])])],
  ])("readsNever reads %s as no value", (_label, type) => {
    expect(hasNoValue(type)).toBe(true);
  });

  it.each([
    ["a primitive", irKeyword("string")],
    ["a union with a value", irUnion([irKeyword("never"), irKeyword("string")])],
    ["an intersection with values", irIntersection([irKeyword("string"), irString("a", "json")])],
    ["an object", EMAIL],
    ["a type it cannot read", irReference("Unknown")],
  ])("readsNever reads %s as a value", (_label, type) => {
    expect(hasNoValue(type)).toBe(false);
  });
});
