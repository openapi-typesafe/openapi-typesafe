import { describe, expect, it } from "vitest";
import {
  irArray,
  irBoolean,
  irIndexedAccess,
  irIntersection,
  irKeyword,
  irNumber,
  irObject,
  irProperty,
  irRaw,
  irReadonly,
  irRecord,
  irReference,
  irString,
  irTuple,
  irTupleElement,
  irUnion,
} from "../../../src/domain/ir/constructors.js";

const STRING = irKeyword("string");
const NUMBER = irKeyword("number");

describe("IR constructors", () => {
  it("irKeyword, irString and irBoolean build literal nodes", () => {
    expect(irKeyword("never")).toEqual({ kind: "keyword", keyword: "never" });
    expect(irString("a", "json")).toEqual({ kind: "stringLiteral", value: "a", encoding: "json" });
    expect(irBoolean(false)).toEqual({ kind: "booleanLiteral", value: false });
  });

  it("irNumber keeps finite numbers including negative ones", () => {
    expect(irNumber(-1.5)).toEqual({ kind: "numberLiteral", value: -1.5 });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "irNumber(%d) throws RangeError",
    (value) => {
      expect(() => irNumber(value)).toThrow(RangeError);
    },
  );

  it("irReference defaults to no type arguments", () => {
    expect(irReference("components")).toEqual({
      kind: "reference",
      name: "components",
      typeArguments: [],
    });
  });

  it("irRecord is a Record reference with key and value arguments", () => {
    expect(irRecord(STRING, NUMBER)).toEqual(irReference("Record", [STRING, NUMBER]));
  });

  it("irTupleElement defaults to a non-rest element", () => {
    expect(irTuple([irTupleElement(STRING), irTupleElement(NUMBER, true)])).toEqual({
      kind: "tuple",
      elements: [
        { type: STRING, isRest: false },
        { type: NUMBER, isRest: true },
      ],
    });
  });

  it("irUnion and irIntersection keep members as given, without de-duplication", () => {
    expect(irUnion([STRING, STRING]).types).toEqual([STRING, STRING]);
    expect(irIntersection([NUMBER]).types).toEqual([NUMBER]);
  });

  it("irArray, irIndexedAccess and irReadonly wrap their operands", () => {
    expect(irArray(STRING)).toEqual({ kind: "array", element: STRING });
    expect(irIndexedAccess(STRING, NUMBER)).toEqual({
      kind: "indexedAccess",
      object: STRING,
      index: NUMBER,
    });
    expect(irReadonly(STRING)).toEqual({ kind: "readonly", type: STRING });
  });

  it("irRaw keeps its text", () => {
    expect(irRaw("B | 2")).toEqual({ kind: "raw", text: "B | 2" });
  });

  it("irProperty defaults flags to false and the comment to null", () => {
    const name = { kind: "identifier", text: "id" } as const;

    expect(irObject([irProperty(name, STRING)]).members).toEqual([
      { kind: "property", name, type: STRING, isOptional: false, isReadonly: false, comment: null },
    ]);
  });

  it("irProperty keeps the given flags and comment", () => {
    const name = { kind: "identifier", text: "id" } as const;
    const comment = { kind: "line", text: " note" } as const;

    expect(irProperty(name, STRING, { isOptional: true, isReadonly: true, comment })).toMatchObject(
      {
        isOptional: true,
        isReadonly: true,
        comment,
      },
    );
  });
});
