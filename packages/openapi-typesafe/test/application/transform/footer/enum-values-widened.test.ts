import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { checkedEnumValues } from "../../../../src/application/transform/footer/enum-values-check.js";
import { TypeEvaluator } from "../../../../src/application/transform/footer/type-evaluation.js";
import {
  irArray,
  irBoolean,
  irIndexedAccess,
  irIntersection,
  irKeyword,
  irObject,
  irOptionalTupleElement,
  irProperty,
  irRaw,
  irReference,
  irString,
  irTuple,
  irTupleElement,
  irUnion,
} from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrType } from "../../../../src/domain/ir/nodes.js";

/**
 * The `--enum-values` check of a location that admits more than the array's values, and tuples
 * read through `FlattenedDeepRequired` (ADR-027).
 */

const text = (value: string) => irString(value, "json");
const key = (value: string) => irString(value, "escaped");
const name = (value: string) => ({ kind: "identifier", text: value }) as const;

const PAIR = irTuple([
  irTupleElement(irUnion([text("asc"), text("desc")])),
  irTupleElement(irUnion([text("name"), text("date")])),
]);
const OPEN = irTuple([
  irOptionalTupleElement(irUnion([text("t1"), text("t2")])),
  irTupleElement(irArray(irKeyword("unknown")), true),
]);
const SCHEMAS = irObject([
  irProperty(name("Pair"), PAIR),
  irProperty(name("Open"), OPEN),
  irProperty(name("Raw"), irTuple([irTupleElement(irRaw("X"), true)])),
  irProperty(name("Odd"), irTuple([irTupleElement(text("z"), true)])),
  irProperty(
    name("Rest"),
    irTuple([irTupleElement(text("x")), irTupleElement(irArray(text("y")), true)]),
  ),
  irProperty(name("Optional"), irTuple([irOptionalTupleElement(text("x"))])),
  irProperty(name("Status"), irUnion([text("a"), text("b")])),
  irProperty(name("Text"), irKeyword("string")),
  irProperty(name("Flag"), irUnion([text("a"), irBoolean(true)])),
  irProperty(
    name("Other"),
    irUnion([text("a"), irIntersection([irKeyword("string"), irObject([])])]),
  ),
]);
const DECLARATIONS: IrDeclaration[] = [
  {
    kind: "interface",
    name: "components",
    isExported: true,
    members: [irProperty(name("schemas"), SCHEMAS)],
    comments: [],
  },
];

function schema(schemaName: string): IrType {
  const components = irReference("FlattenedDeepRequired", [irReference("components")]);
  return irIndexedAccess(irIndexedAccess(components, key("schemas")), key(schemaName));
}

function array(arrayName: string, type: IrType, values: string[]): IrDeclaration {
  const typed = irReference("ReadonlyArray", [type]);
  return {
    kind: "constArray",
    name: arrayName,
    isExported: true,
    type: typed,
    values,
    comments: [],
  };
}

function retypedOf(footer: readonly IrDeclaration[]): string[][] {
  const { retyped } = checkedEnumValues(
    footer,
    DECLARATIONS,
    (_entry): _entry is IrDeclaration => true,
  );
  return retyped.map((retype) => [retype.kind, retype.name]);
}

function evaluated(schemaName: string): string {
  const result = new TypeEvaluator(DECLARATIONS).evaluate(schema(schemaName));
  if (result.kind !== "type") {
    return result.kind;
  }
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type: result.type }]).slice("type T = ".length, -2);
}

describe("TypeEvaluator of tuples", () => {
  it("evaluate reads a tuple inside FlattenedDeepRequired as the union of its elements", () => {
    expect(evaluated("Pair")).toBe('("asc" | "desc") | ("name" | "date")');
    expect(evaluated("Rest")).toBe('"x" | "y"');
    expect(evaluated("Optional")).toBe('"x" | undefined');
  });

  it("evaluate leaves a tuple with a rest element of no array type opaque", () => {
    expect(evaluated("Raw")).toBe("opaque");
    expect(evaluated("Odd")).toBe("opaque");
  });
});

describe("checkedEnumValues of a location that admits more", () => {
  it("checkedEnumValues retypes an array whose location admits other literals or unknown", () => {
    const footer = [
      array("pair", schema("Pair"), ["asc", "desc"]),
      array("open", schema("Open"), ["t1", "t2"]),
      array("flag", schema("Flag"), ["a"]),
    ];

    expect(retypedOf(footer)).toEqual([
      ["widened", "pair"],
      ["widened", "open"],
      ["widened", "flag"],
    ]);
  });

  it("checkedEnumValues keeps a location of exactly the values or of an open type", () => {
    const footer = [
      array("status", schema("Status"), ["a", "b"]),
      array("text", schema("Text"), ["a"]),
      array("other", schema("Other"), ["a"]),
    ];

    expect(retypedOf(footer)).toEqual([]);
  });
});
