import { describe, expect, it } from "vitest";
import { globalTypeReferences } from "../../../../src/application/transform/document/global-type-references.js";
import type { IrDeclaration } from "../../../../src/domain/ir/nodes.js";

function aliasOf(type: object): IrDeclaration {
  return { kind: "typeAlias", name: "A", isExported: true, type, comments: [] } as IrDeclaration;
}

describe("globalTypeReferences", () => {
  it("globalTypeReferences finds a nested reference to a global type", () => {
    const record = { kind: "reference", name: "Record", typeArguments: [] };
    const declaration = aliasOf({ kind: "union", types: [record] });

    expect([...globalTypeReferences([declaration])]).toEqual(["Record"]);
  });

  it("globalTypeReferences ignores references to other types", () => {
    const declaration = aliasOf({ kind: "reference", name: "components", typeArguments: [] });

    expect(globalTypeReferences([declaration]).size).toBe(0);
  });

  it("globalTypeReferences finds generic uses in raw text and raw declarations", () => {
    const raw = aliasOf({ kind: "raw", text: "Omit<A, 'b'> & Foo<B>" });
    const helper: IrDeclaration = { kind: "rawDeclaration", text: "type X<T> = Exclude<T, null>;" };

    expect([...globalTypeReferences([raw, helper])].sort()).toEqual(["Exclude", "Omit"]);
  });

  it("globalTypeReferences skips comments and the origin of raw types", () => {
    const origin = { kind: "reference", name: "Pick", typeArguments: [] };
    const declaration = {
      ...aliasOf({ kind: "raw", text: "string", origin }),
      comments: [{ kind: "line", text: "Record<string, never>" }],
    } as IrDeclaration;

    expect(globalTypeReferences([declaration]).size).toBe(0);
  });
});
