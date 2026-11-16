import { describe, expect, it } from "vitest";
import { withEnumReferencesNarrowed } from "../../../../src/application/transform/document/enum-narrowing.js";
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
  return withEnumReferencesNarrowed([aliasOf(type)], enums);
}

const MODE_ABC = modeOf(["a", "a"], ["b", "b"], ["c", "c"]);

describe("withEnumReferencesNarrowed", () => {
  it("withEnumReferencesNarrowed types a reference of fewer values by their members", () => {
    expect(narrowed(modeFor("c", "a"), MODE_ABC)).toEqual([
      aliasOf(irUnion([irReference("Mode.c"), irReference("Mode.a")])),
    ]);
  });

  it("withEnumReferencesNarrowed types a reference of one value of several by its member", () => {
    expect(narrowed(modeFor("b", "b"), MODE_ABC)).toEqual([aliasOf(irReference("Mode.b"))]);
  });

  it("withEnumReferencesNarrowed keeps a reference of every value the whole enum", () => {
    expect(narrowed(modeFor("c", "b", "a"), MODE_ABC)).toEqual([aliasOf(irReference("Mode"))]);
  });

  it("withEnumReferencesNarrowed reads the members of every declaration of the enum", () => {
    const enums = [modeOf(["a", "a"]), modeOf(["b", "b"])];

    expect(narrowed(modeFor("b"), ...enums)).toEqual([aliasOf(irReference("Mode.b"))]);
  });

  it("withEnumReferencesNarrowed names a value by the first member that has it", () => {
    const enums = [modeOf(["First", "a"], ["Second", "a"], ["b", "b"])];

    expect(narrowed(modeFor("a"), ...enums)).toEqual([aliasOf(irReference("Mode.First"))]);
  });

  it("withEnumReferencesNarrowed keeps a string and a number of one text apart", () => {
    const enums = [modeOf(["Text", "1"], ["Number", 1])];

    expect(narrowed(modeFor(1), ...enums)).toEqual([aliasOf(irReference("Mode.Number"))]);
  });

  it("withEnumReferencesNarrowed reads a quoted member by index", () => {
    const enums = [modeOf(['"+"', "plus"], ["b", "b"])];

    expect(narrowed(modeFor("plus"), ...enums)).toEqual([
      aliasOf(irIndexedAccess(irReference("typeof Mode"), irString("+", "escaped"))),
    ]);
  });

  it("withEnumReferencesNarrowed keeps a value the enum has no member of the whole enum", () => {
    expect(narrowed(modeFor("x"), modeOf(["a", "a"]))).toEqual([aliasOf(irReference("Mode"))]);
  });

  it("withEnumReferencesNarrowed reads listed values on references only", () => {
    const raw = { kind: "raw", text: "Mode", enumValues: ["a"] } as unknown as IrType;

    expect(narrowed(raw, MODE_ABC)).toEqual([aliasOf(raw)]);
  });

  it("withEnumReferencesNarrowed leaves references without listed values as they are", () => {
    const declarations = [aliasOf(irReference("Mode"))];

    const result = withEnumReferencesNarrowed(declarations, [MODE_ABC]);

    expect(result[0]).toBe(declarations[0]);
  });
});
