import { describe, expect, it } from "vitest";
import { enumReferenceNarrowing } from "../../../../src/application/transform/document/enum-narrowing.js";
import {
  irIndexedAccess,
  irReference,
  irString,
  irUnion,
} from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrEnumDeclaration, IrType } from "../../../../src/domain/ir/nodes.js";

function modeOf(...members: [string, string | number][]): IrEnumDeclaration {
  return {
    kind: "enum",
    name: "Mode",
    isExported: true,
    members: members.map(([name, value]) => ({ name, value, comments: [] })),
    comments: [],
  };
}

function aliasOf(type: IrType): IrDeclaration {
  return { kind: "typeAlias", name: "T", isExported: true, type, comments: [] };
}

function modeFor(...values: (string | number)[]): IrType {
  return { ...irReference("Mode"), enumValues: values };
}

function narrowed(type: IrType, ...enums: IrEnumDeclaration[]): IrDeclaration[] {
  return enumReferenceNarrowing(enums)([aliasOf(type)]);
}

const MODE_ABC = modeOf(["a", "a"], ["b", "b"], ["c", "c"]);

describe("enumReferenceNarrowing", () => {
  it("enumReferenceNarrowing types a reference of fewer values by their members", () => {
    expect(narrowed(modeFor("c", "a"), MODE_ABC)).toEqual([
      aliasOf(irUnion([irReference("Mode.c"), irReference("Mode.a")])),
    ]);
  });

  it("enumReferenceNarrowing types a reference of one value of several by its member", () => {
    expect(narrowed(modeFor("b", "b"), MODE_ABC)).toEqual([aliasOf(irReference("Mode.b"))]);
  });

  it("enumReferenceNarrowing keeps a reference of every value the whole enum", () => {
    expect(narrowed(modeFor("c", "b", "a"), MODE_ABC)).toEqual([aliasOf(irReference("Mode"))]);
  });

  it("enumReferenceNarrowing reads the members of every declaration of the enum", () => {
    const enums = [modeOf(["a", "a"]), modeOf(["b", "b"])];

    expect(narrowed(modeFor("b"), ...enums)).toEqual([aliasOf(irReference("Mode.b"))]);
  });

  it("enumReferenceNarrowing names a value by the first member that has it", () => {
    const enums = [modeOf(["First", "a"], ["Second", "a"], ["b", "b"])];

    expect(narrowed(modeFor("a"), ...enums)).toEqual([aliasOf(irReference("Mode.First"))]);
  });

  it("enumReferenceNarrowing keeps a string and a number of one text apart", () => {
    const enums = [modeOf(["Text", "1"], ["Number", 1])];

    expect(narrowed(modeFor(1), ...enums)).toEqual([aliasOf(irReference("Mode.Number"))]);
  });

  it("enumReferenceNarrowing reads a quoted member by index", () => {
    const enums = [modeOf(['"+"', "plus"], ["b", "b"])];

    expect(narrowed(modeFor("plus"), ...enums)).toEqual([
      aliasOf(irIndexedAccess(irReference("typeof Mode"), irString("+", "escaped"))),
    ]);
  });

  it("enumReferenceNarrowing keeps a value the enum has no member of the whole enum", () => {
    expect(narrowed(modeFor("x"), modeOf(["a", "a"]))).toEqual([aliasOf(irReference("Mode"))]);
  });

  it("enumReferenceNarrowing reads listed values on references only", () => {
    const raw = { kind: "raw", text: "Mode", enumValues: ["a"] } as unknown as IrType;

    expect(narrowed(raw, MODE_ABC)).toEqual([aliasOf(raw)]);
  });

  it("enumReferenceNarrowing joins requests of one enum in a union into the whole enum", () => {
    const union = irUnion([modeFor("a"), irString("x"), modeFor("c", "b")]);

    expect(narrowed(union, MODE_ABC)).toEqual([
      aliasOf(irUnion([irReference("Mode"), irString("x")])),
    ]);
  });

  it("enumReferenceNarrowing joins requests of one enum into the members they list", () => {
    const union = irUnion([modeFor("c"), modeFor("a")]);

    expect(narrowed(union, MODE_ABC)).toEqual([
      aliasOf(irUnion([irReference("Mode.c"), irReference("Mode.a")])),
    ]);
  });

  it("enumReferenceNarrowing keeps requests of other enums and plain references apart", () => {
    const other = { ...irReference("Other"), enumValues: ["a"] };
    const union = irUnion([modeFor("a"), other, irReference("Mode"), modeFor("b")]);
    const otherEnum = { ...modeOf(["a", "a"], ["z", "z"]), name: "Other" };

    expect(narrowed(union, MODE_ABC, otherEnum)).toEqual([
      aliasOf(
        irUnion([
          irUnion([irReference("Mode.a"), irReference("Mode.b")]),
          irReference("Other.a"),
          irReference("Mode"),
        ]),
      ),
    ]);
  });

  it("enumReferenceNarrowing leaves a union without repeated requests as it is", () => {
    const declarations = [aliasOf(irUnion([irReference("Mode"), irString("x")]))];

    const result = enumReferenceNarrowing([MODE_ABC])(declarations);

    expect(result[0]).toBe(declarations[0]);
  });

  it("enumReferenceNarrowing leaves references without listed values as they are", () => {
    const declarations = [aliasOf(irReference("Mode"))];

    const result = enumReferenceNarrowing([MODE_ABC])(declarations);

    expect(result[0]).toBe(declarations[0]);
  });
});
