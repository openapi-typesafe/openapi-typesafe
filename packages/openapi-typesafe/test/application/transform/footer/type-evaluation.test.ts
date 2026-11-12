import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { checkedEnumValues } from "../../../../src/application/transform/footer/enum-values-check.js";
import type { Evaluation } from "../../../../src/application/transform/footer/evaluation.js";
import { TypeEvaluator } from "../../../../src/application/transform/footer/type-evaluation.js";
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
  irReference,
  irString,
  irStringIndexSignature,
  irTuple,
  irTupleElement,
  irUnion,
} from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrType } from "../../../../src/domain/ir/nodes.js";

/** The evaluator of the `--enum-values` check (ADR-027), on hand-written declarations. */

const text = (value: string) => irString(value, "json");
const key = (value: string) => irString(value, "escaped");

const SCHEMAS = irObject([
  irProperty(
    { kind: "identifier", text: "A" },
    irObject([
      irProperty({ kind: "identifier", text: "status" }, irUnion([text("a"), text("b")]), {
        isOptional: true,
      }),
      irProperty(
        { kind: "identifier", text: "tags" },
        irUnion([irArray(irArray(text("t"))), irKeyword("undefined")]),
      ),
      irProperty({ kind: "string", value: "x-y" }, irKeyword("unknown")),
    ]),
  ),
  irProperty(
    { kind: "identifier", text: "Map" },
    irObject([irStringIndexSignature("key", text("m"))]),
  ),
  irProperty(
    { kind: "identifier", text: "Frozen" },
    irObject([irProperty({ kind: "identifier", text: "tags" }, irReadonly(irArray(text("f"))))]),
  ),
  irProperty(
    { kind: "identifier", text: "Both" },
    irIntersection([
      irIndexedAccess(irIndexedAccess(irReference("components"), key("schemas")), key("A")),
      irObject([irProperty({ kind: "identifier", text: "status" }, text("a"))]),
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
  { kind: "typeAlias", name: "Alias", isExported: true, type: irReadonly(text("r")), comments: [] },
  { kind: "typeAlias", name: "Loop", isExported: true, type: irReference("Loop"), comments: [] },
];

function deep(...keys: IrType[]): IrType {
  return keys.reduce<IrType>(
    (type, index) => irIndexedAccess(type, index),
    irReference("FlattenedDeepRequired", [irReference("components")]),
  );
}

function evaluated(type: IrType): string {
  const result: Evaluation = new TypeEvaluator(DECLARATIONS).evaluate(type);
  if (result.kind !== "type") {
    return result.kind;
  }
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type: result.type }]).slice("type T = ".length, -2);
}

describe("TypeEvaluator", () => {
  it("evaluate reads properties, index signatures and intersections", () => {
    expect(evaluated(deep(key("schemas"), key("A"), key("status")))).toBe('"a" | "b"');
    expect(evaluated(deep(key("schemas"), key("Map"), irKeyword("string")))).toBe('"m"');
    expect(evaluated(deep(key("schemas"), key("Both"), key("status")))).toBe('("a" | "b") & "a"');
    expect(evaluated(deep(key("schemas"), key("A"), key("x-y")))).toBe("unknown");
  });

  it("evaluate flattens one level of arrays and misses keys of arrays and unknown", () => {
    expect(evaluated(deep(key("schemas"), key("A"), key("tags")))).toBe('"t"[]');
    expect(evaluated(deep(key("schemas"), key("A"), key("tags"), key("type")))).toBe("missing");
    expect(evaluated(deep(key("schemas"), key("A"), key("x-y"), key("z")))).toBe("missing");
    expect(evaluated(deep(key("schemas"), key("A"), key("nope")))).toBe("missing");
    expect(evaluated(deep(key("schemas"), key("A"), key("tags"), irNumber(0)))).toBe('"t"');
  });

  it("evaluate reads helper types and leaves other shapes opaque", () => {
    const status = deep(key("schemas"), key("A"), key("status"));
    expect(evaluated(irReference("NonNullable", [irUnion([text("n"), irKeyword("null")])]))).toBe(
      '"n"',
    );
    expect(evaluated(irReference("WithRequired", [irReference("Alias"), text("k")]))).toBe('"r"');
    expect(evaluated(irReference("Extract", [status, irKeyword("string")]))).toBe("opaque");
    expect(evaluated(irReference("Record", [irKeyword("number"), status]))).toBe("opaque");
    expect(evaluated(irReference("Record", [irKeyword("string")]))).toBe("opaque");
    expect(evaluated(irReference("FlattenedDeepRequired", [irReference("nothing")]))).toBe(
      "opaque",
    );
    expect(evaluated(irReference("FlattenedDeepRequired", [irKeyword("string")]))).toBe("opaque");
    expect(evaluated(irReference("Unknown"))).toBe("opaque");
    expect(evaluated(irRaw("string"))).toBe("opaque");
    expect(evaluated(irTuple([irTupleElement(text("t"))]))).toBe("opaque");
    expect(evaluated(irIndexedAccess(text("s"), key("length")))).toBe("opaque");
    expect(evaluated(irIndexedAccess(irKeyword("never"), key("x")))).toBe("never");
  });

  it("evaluate reads a string Record as an index signature that declared properties override", () => {
    const record = irReference("Record", [irKeyword("string"), irKeyword("never")]);
    const owner = irIntersection([
      record,
      irObject([irProperty({ kind: "identifier", text: "op" }, text("add"))]),
    ]);

    expect(evaluated(irIndexedAccess(record, key("op")))).toBe("never");
    expect(evaluated(irIndexedAccess(owner, key("op")))).toBe('"add"');
  });

  it("evaluate narrows a union with an Extract probe", () => {
    const union = irUnion([
      irObject([irProperty({ kind: "identifier", text: "a" }, text("1"))]),
      irObject([irProperty({ kind: "identifier", text: "b" }, text("2"))]),
    ]);
    const probe = irObject([irProperty({ kind: "identifier", text: "b" }, irKeyword("unknown"))]);

    expect(evaluated(irIndexedAccess(irReference("Extract", [union, probe]), key("b")))).toBe(
      '"2"',
    );
  });

  it("evaluate does not count an index signature or an optional property for Extract", () => {
    const map = deep(key("schemas"), key("Map"));
    const probe = (name: string) =>
      irObject([irProperty({ kind: "identifier", text: name }, irKeyword("unknown"))]);
    const optional = irObject([
      irProperty({ kind: "identifier", text: "o" }, text("1"), { isOptional: true }),
    ]);

    expect(evaluated(irReference("Extract", [map, probe("m")]))).toBe("missing");
    expect(evaluated(irReference("Extract", [optional, probe("o")]))).toBe("missing");
    expect(evaluated(irReference("Extract", [irRaw("x"), probe("o")]))).toBe("opaque");
  });

  it("evaluate reads Omit and drops properties where an index signature is present", () => {
    const a = irIndexedAccess(irIndexedAccess(irReference("components"), key("schemas")), key("A"));
    const both = irIntersection([a, irObject([irStringIndexSignature("key", text("i"))])]);

    expect(evaluated(irIndexedAccess(irReference("Omit", [a, text("tags")]), key("tags")))).toBe(
      "missing",
    );
    expect(evaluated(irIndexedAccess(irReference("Omit", [both, text("x")]), key("status")))).toBe(
      '"i"',
    );
    expect(evaluated(irReference("Omit", [a, irKeyword("string")]))).toBe("opaque");
  });

  it("evaluate reduces objects with disjoint required literal properties to never", () => {
    const kind = (value: string, isOptional = false) =>
      irObject([irProperty({ kind: "identifier", text: "kind" }, text(value), { isOptional })]);
    const index = (type: IrType) => evaluated(irIndexedAccess(type, key("kind")));

    expect(index(irIntersection([kind("a"), kind("b")]))).toBe("never");
    expect(index(irIntersection([kind("a", true), kind("b", true)]))).toBe('"a" & "b"');
    expect(index(irIntersection([kind("a"), kind("a")]))).toBe('"a" & "a"');
  });

  it("evaluate reduces other unit conflicts and null next to an object to never", () => {
    const kind = (type: IrType) =>
      irObject([irProperty({ kind: "identifier", text: "kind" }, type)]);
    const index = (...types: IrType[]) =>
      evaluated(irIndexedAccess(irIntersection(types), key("kind")));

    expect(index(kind(irNumber(1)), kind(irNumber(2)))).toBe("never");
    expect(index(kind(irBoolean(true)), kind(irBoolean(false)))).toBe("never");
    expect(index(kind(irKeyword("null")), kind(text("a")))).toBe("never");
    expect(index(kind(irKeyword("string")), kind(text("a")))).toBe('string & "a"');
    expect(index(irKeyword("null"), kind(text("a")))).toBe("never");
    expect(index(irKeyword("undefined"), kind(text("a")))).toBe("never");
    expect(index(irKeyword("string"), kind(text("a")), kind(text("b")))).toBe("never");
  });

  it("evaluate reads a declared property before index signatures of other parts", () => {
    const declared = irObject([irProperty({ kind: "identifier", text: "o" }, text("system"))]);
    const signature = irObject([irStringIndexSignature("key", text("custom"))]);
    const index = (name: string) =>
      evaluated(irIndexedAccess(irIntersection([declared, signature]), key(name)));

    expect(index("o")).toBe('"system"');
    expect(index("other")).toBe('"custom"');
  });

  it("evaluate leaves helper types it cannot read opaque", () => {
    const a = irIndexedAccess(irIndexedAccess(irReference("components"), key("schemas")), key("A"));
    const twice = irIntersection([a, a]);
    const probe = irObject([irProperty({ kind: "identifier", text: "k" }, irKeyword("unknown"))]);
    const withRaw = irIntersection([irRaw("x"), irObject([])]);

    expect(evaluated(irReference("Extract", [a]))).toBe("opaque");
    expect(evaluated(irReference("Omit", [a]))).toBe("opaque");
    expect(evaluated(irReference("Omit", [twice, text("x")]))).toBe("opaque");
    expect(evaluated(irReference("Extract", [withRaw, probe]))).toBe("opaque");
    expect(evaluated(irReference("Extract", [irUnion([text("s"), irRaw("x")]), probe]))).toBe(
      "opaque",
    );
  });

  it("evaluate keeps an intersection member that has the Extract key in one part", () => {
    const has = irObject([irProperty({ kind: "identifier", text: "k" }, text("v"))]);
    const probe = irObject([irProperty({ kind: "identifier", text: "k" }, irKeyword("unknown"))]);
    const both = irIntersection([irObject([]), has]);

    expect(evaluated(irIndexedAccess(irReference("Extract", [both, probe]), key("k")))).toBe('"v"');
    expect(evaluated(irReference("Extract", [irArray(text("a")), probe]))).toBe("missing");
  });

  it("evaluate leaves a reference that never resolves opaque", () => {
    expect(evaluated(irReference("Loop"))).toBe("opaque");
  });

  it("evaluate flattens a readonly array and reads arrays by a string key as built-ins", () => {
    expect(evaluated(deep(key("schemas"), key("Frozen"), key("tags")))).toBe('"f"');
    expect(evaluated(irIndexedAccess(irArray(text("a")), irKeyword("string")))).toBe("opaque");
  });

  it("evaluate leaves a union or an intersection with a type it cannot read opaque", () => {
    const has = irObject([irProperty({ kind: "identifier", text: "k" }, text("v"))]);
    const index = (type: IrType) => evaluated(irIndexedAccess(type, key("k")));

    expect(evaluated(irReference("NonNullable", [irUnion([text("n"), irRaw("x")])]))).toBe(
      "opaque",
    );
    expect(index(irUnion([has, irRaw("x")]))).toBe("opaque");
    expect(index(irIntersection([irRaw("x"), has]))).toBe("opaque");
  });

  it("evaluate reads a union of one member as that member", () => {
    const has = irObject([irProperty({ kind: "identifier", text: "k" }, text("v"))]);

    expect(evaluated(irIndexedAccess(irUnion([has]), key("k")))).toBe('"v"');
  });

  it("evaluate misses a key that no part of an intersection has", () => {
    const part = (name: string) =>
      irObject([irProperty({ kind: "identifier", text: name }, text(name))]);

    expect(evaluated(irIndexedAccess(irIntersection([part("a"), part("b")]), key("c")))).toBe(
      "missing",
    );
  });

  it("evaluate keeps properties of the same name that are not only units", () => {
    const kind = (type: IrType) =>
      irObject([irProperty({ kind: "identifier", text: "kind" }, type)]);
    const index = (...types: IrType[]) =>
      evaluated(irIndexedAccess(irIntersection(types), key("kind")));

    expect(index(kind(irArray(text("a"))), kind(text("a")))).toBe('"a"[] & "a"');
    expect(index(kind(irRaw("X")), kind(text("a")))).toBe("opaque");
  });
});

describe("checkedEnumValues", () => {
  function array(name: string, type: IrType, values: string[]): IrDeclaration {
    return {
      kind: "constArray",
      name,
      isExported: true,
      type: irReference("ReadonlyArray", [type]),
      values,
      comments: [],
    };
  }

  it("checkedEnumValues retypes only arrays whose location does not hold their values", () => {
    const footer = [
      array("kept", deep(key("schemas"), key("A"), key("status")), ["a", "b"]),
      array("missing", deep(key("schemas"), key("A"), key("nope")), ["a"]),
      array("excluded", deep(key("schemas"), key("Both"), key("status")), ["a", "b"]),
      array("opaque", irReference("Elsewhere"), ["a"]),
      { kind: "rawDeclaration", text: "type X = 1;" } as IrDeclaration,
    ];

    const { footer: checked, retyped } = checkedEnumValues(
      footer,
      DECLARATIONS,
      (_entry): _entry is IrDeclaration => true,
    );

    expect(retyped.map((retype) => [retype.kind, retype.name])).toEqual([
      ["untyped", "missing"],
      ["excluded", "excluded"],
    ]);
    expect(checked[0]).toBe(footer[0]);
    expect(checked[3]).toBe(footer[3]);
  });

  it("checkedEnumValues reads array, boolean and opaque location types", () => {
    const nope = deep(key("schemas"), key("A"), key("nope"));
    const footer = [
      array("elements", irArray(nope), ["a"]),
      array("boolean", irBoolean(true), ["a"]),
      array("someRaw", irUnion([irRaw("x"), text("b")]), ["a"]),
      array("rawFirst", irIntersection([irRaw("x"), text("b")]), ["b"]),
      { ...array("plain", text("a"), ["a"]), type: text("a") },
    ];

    const { retyped } = checkedEnumValues(
      footer,
      DECLARATIONS,
      (_entry): _entry is IrDeclaration => true,
    );

    // A union that holds a literal outside the values admits more, whatever its other members are.
    expect(retyped.map((retype) => [retype.kind, retype.name])).toEqual([
      ["untyped", "elements"],
      ["excluded", "boolean"],
      ["widened", "someRaw"],
    ]);
  });

  it("checkedEnumValues keeps an array of opaque elements and a ReadonlyArray with no argument", () => {
    const footer = [
      array("opaqueElements", irArray(irReference("Elsewhere")), ["a"]),
      { ...array("bare", text("a"), ["a"]), type: irReference("ReadonlyArray") },
    ];

    const { footer: checked, retyped } = checkedEnumValues(
      footer,
      DECLARATIONS,
      (_entry): _entry is IrDeclaration => true,
    );

    expect(retyped).toEqual([]);
    expect(checked).toEqual(footer);
  });
});
