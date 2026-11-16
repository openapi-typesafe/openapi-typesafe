import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { checkedEnumValues } from "../../../../src/application/transform/footer/enum-values-check.js";
import { TypeEvaluator } from "../../../../src/application/transform/footer/type-evaluation.js";
import {
  irArray,
  irIndexedAccess,
  irIntersection,
  irKeyword,
  irNumber,
  irObject,
  irProperty,
  irRaw,
  irReference,
  irString,
  irStringIndexSignature,
  irTuple,
  irTupleElement,
  irUnion,
} from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrType } from "../../../../src/domain/ir/nodes.js";

/**
 * Tuples, intersections with `unknown` and intersections with arrays in the evaluator of the
 * `--enum-values` check (ADR-027), and arrays at tuple locations.
 */

const text = (value: string) => irString(value, "json");
const key = (value: string) => irString(value, "escaped");
const property = (name: string, type: IrType) =>
  irProperty({ kind: "identifier", text: name }, type, { isOptional: true });

const PAIR = irTuple([irTupleElement(text("a")), irTupleElement(text("b"))]);
const WITH_REST = irTuple([irTupleElement(text("a")), irTupleElement(irArray(text("r")), true)]);

const SCHEMAS = irObject([
  property("Pair", irArray(PAIR)),
  property("Rest", irArray(WITH_REST)),
  property(
    "Described",
    irIntersection([irObject([property("k", text("k"))]), irKeyword("unknown")]),
  ),
  property("OnlyUnknown", irIntersection([irKeyword("unknown"), irKeyword("unknown")])),
  property(
    "DescribedTuple",
    irIntersection([
      irTuple([irTupleElement(irObject([property("k", text("k"))]))]),
      irKeyword("unknown"),
    ]),
  ),
  property(
    "DescribedArray",
    irIntersection([irArray(irObject([property("k", text("k"))])), irKeyword("unknown")]),
  ),
  property(
    "Mixed",
    irIntersection([
      irObject([property("m", irObject([property("Kind", text("b"))]))]),
      irObject([property("m", irArray(text("c")))]),
    ]),
  ),
  property(
    "PartlyArray",
    irIntersection([
      irObject([
        property("m", irUnion([irArray(text("c")), irObject([property("K", text("k"))])])),
      ]),
      irObject([property("m", irObject([property("K", text("k"))]))]),
    ]),
  ),
  property(
    "MixedPart",
    irIntersection([
      irObject([
        property("m", irUnion([irArray(text("c")), irObject([property("K", text("k"))])])),
      ]),
      irObject([property("m", irArray(text("c")))]),
    ]),
  ),
  property(
    "WithUnknown",
    irIntersection([
      irObject([property("m", irArray(text("c")))]),
      irObject([property("m", irKeyword("unknown"))]),
    ]),
  ),
  property(
    "WithOtherSignature",
    irIntersection([
      irObject([property("m", irArray(text("c")))]),
      irObject([irStringIndexSignature("key", text("s"))]),
    ]),
  ),
  property(
    "Arrays",
    irIntersection([
      irObject([property("m", irArray(text("c")))]),
      irObject([property("m", irArray(text("c")))]),
    ]),
  ),
  property(
    "ArrayPart",
    irObject([
      property("m", irIntersection([irObject([property("Kind", text("b"))]), irArray(text("c"))])),
    ]),
  ),
  property(
    "Signature",
    irIntersection([
      irObject([irStringIndexSignature("key", irArray(text("c")))]),
      irObject([property("m", irArray(text("c")))]),
    ]),
  ),
]);

const DECLARATIONS: IrDeclaration[] = [
  {
    kind: "interface",
    name: "components",
    isExported: true,
    members: [irProperty({ kind: "identifier", text: "schemas" }, SCHEMAS)],
    comments: [],
  },
];

function deep(...keys: string[]): IrType {
  return keys.reduce<IrType>(
    (type, index) =>
      irIndexedAccess(type, /^\d+$/.test(index) ? irNumber(Number(index)) : key(index)),
    irIndexedAccess(
      irReference("FlattenedDeepRequired", [irReference("components")]),
      key("schemas"),
    ),
  );
}

function evaluated(type: IrType): string {
  const result = new TypeEvaluator(DECLARATIONS).evaluate(type);
  if (result.kind !== "type") {
    return result.kind;
  }
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type: result.type }]).slice("type T = ".length, -2);
}

function retypes(location: IrType, values: string[]): string[] {
  const array: IrDeclaration = {
    kind: "constArray",
    name: "values",
    isExported: true,
    type: irReference("ReadonlyArray", [location]),
    values,
    comments: [],
  };
  const { retyped } = checkedEnumValues([array], DECLARATIONS, (_e): _e is IrDeclaration => true);
  return retyped.map((retype) => retype.kind);
}

describe("TypeEvaluator with tuples", () => {
  it("evaluate keeps a tuple inside FlattenedDeepRequired", () => {
    expect(evaluated(deep("Pair"))).toBe('[\n    "a",\n    "b"\n]');
  });

  it("evaluate reads a tuple position as its element and number as all items", () => {
    expect(evaluated(deep("Pair", "0"))).toBe('"a"');
    expect(evaluated(deep("Pair", "1"))).toBe('"b"');
    expect(evaluated(irIndexedAccess(deep("Pair"), irKeyword("number")))).toBe('"a" | "b"');
  });

  it("evaluate misses a position past the end of a tuple without a rest element", () => {
    expect(evaluated(deep("Pair", "2"))).toBe("missing");
  });

  it("evaluate reads a position at or after a rest element as all items", () => {
    expect(evaluated(deep("Rest", "0"))).toBe('"a"');
    expect(evaluated(deep("Rest", "1"))).toBe('"a" | "r"');
    expect(evaluated(deep("Rest", "5"))).toBe('"a" | "r"');
  });

  it("evaluate reads a key of a tuple that is no position as a key of an array", () => {
    expect(evaluated(deep("Pair", "nope"))).toBe("missing");
    expect(evaluated(deep("Pair", "length"))).toBe("opaque");
  });
});

describe("TypeEvaluator with intersections", () => {
  it("evaluate reads X & unknown as X", () => {
    expect(evaluated(deep("Described", "k"))).toBe('"k"');
    expect(evaluated(deep("OnlyUnknown"))).toBe("unknown");
  });

  it("evaluate leaves an array or a tuple next to unknown in its intersection, read as opaque", () => {
    expect(evaluated(deep("DescribedArray", "k"))).toBe("opaque");
    expect(evaluated(deep("DescribedTuple", "k"))).toBe("opaque");
  });

  it("evaluate leaves a key that is an array in one part and an object in another opaque", () => {
    expect(evaluated(deep("Mixed", "m"))).toBe("opaque");
    expect(evaluated(deep("Signature", "m"))).toBe('"c"');
  });

  it("evaluate leaves a key that is an array or an object in one part opaque", () => {
    expect(evaluated(deep("MixedPart", "m"))).toBe("opaque");
  });

  it("evaluate reads a key that is partly an array in one part and an object in another", () => {
    expect(evaluated(deep("PartlyArray", "m", "K"))).toBe('"k" | ("k" & "k")');
  });

  it("evaluate reads an array next to unknown or an index signature it overrides", () => {
    expect(evaluated(deep("WithUnknown", "m"))).toBe('"c" & unknown');
    expect(evaluated(deep("WithOtherSignature", "m"))).toBe('"c"');
  });

  it("evaluate reads a key that is an array in every part as their elements", () => {
    expect(evaluated(deep("Arrays", "m"))).toBe('"c" & "c"');
  });

  it("evaluate leaves a property of an object and an array opaque", () => {
    expect(evaluated(deep("ArrayPart", "m"))).toBe("opaque");
  });
});

describe("checkedEnumValues at tuple locations", () => {
  it("checkedEnumValues keeps an array that fills the tuple at its location", () => {
    expect(retypes(deep("Pair"), ["a", "b"])).toEqual([]);
  });

  it("checkedEnumValues types an array of another length or order by its values", () => {
    expect(retypes(deep("Pair"), ["a"])).toEqual(["untyped"]);
    expect(retypes(deep("Pair"), ["b", "a"])).toEqual(["untyped"]);
    expect(retypes(deep("Rest"), ["a", "r"])).toEqual(["untyped"]);
  });

  it("checkedEnumValues keeps an array that fits one member of a union with a tuple", () => {
    const location = irUnion([deep("Pair"), irArray(text("x"))]);

    expect(retypes(location, ["x", "x"])).toEqual([]);
    expect(retypes(location, ["a", "b"])).toEqual([]);
    expect(retypes(location, ["y"])).toEqual(["untyped"]);
  });

  it("checkedEnumValues reads a tuple next to a value that is no array by its elements", () => {
    const location = irUnion([deep("Pair"), text("a")]);

    expect(retypes(location, ["a"])).toEqual(["widened"]);
  });

  it("checkedEnumValues types an array that no member of a tuple union admits by its values", () => {
    expect(retypes(irUnion([deep("Pair"), text("a")]), ["x"])).toEqual(["untyped"]);
  });

  it("checkedEnumValues types an array at a tuple next to an opaque member by its values", () => {
    expect(retypes(irUnion([deep("Pair"), irRaw("X")]), ["a", "b"])).toEqual(["untyped"]);
  });

  it("checkedEnumValues types an array at an opaque location by its values", () => {
    expect(retypes(deep("Mixed", "m", "Kind"), ["b"])).toEqual(["untyped"]);
  });
});
