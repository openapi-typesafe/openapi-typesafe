import ts from "typescript";
import { describe, expect, it } from "vitest";
import { toStatement, toTypeNode } from "../../../src/adapters/type-ast-bridge/ir-to-typescript.js";
import { irKeyword, irObject, irProperty } from "../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrPropertyName, IrType } from "../../../src/domain/ir/nodes.js";

function printStatement(statement: ts.Statement): string {
  const source = ts.createSourceFile("out.ts", "", ts.ScriptTarget.ESNext);
  return ts.createPrinter().printNode(ts.EmitHint.Unspecified, statement, source);
}

describe("toStatement", () => {
  it("toStatement with a raw declaration parses its text into a statement", () => {
    const statement = toStatement({ kind: "rawDeclaration", text: "type A = 1;" });

    expect(ts.isTypeAliasDeclaration(statement)).toBe(true);
    expect(printStatement(statement)).toBe("type A = 1;");
  });

  it("toStatement with an unknown declaration kind throws", () => {
    expect(() => toStatement({ kind: "module" } as unknown as IrDeclaration)).toThrow(
      "Unexpected variant",
    );
  });
});

describe("toTypeNode", () => {
  it("toTypeNode with a raw type keeps its text", () => {
    const node = toTypeNode({ kind: "raw", text: "B | 2" });
    const source = ts.createSourceFile("out.ts", "", ts.ScriptTarget.ESNext);

    expect(ts.createPrinter().printNode(ts.EmitHint.Unspecified, node, source)).toBe("B | 2");
  });

  it.each([{ kind: "conditional" }, { kind: "template" }])(
    "toTypeNode with unknown kind %j throws",
    (type) => {
      expect(() => toTypeNode(type as unknown as IrType)).toThrow("Unexpected variant");
    },
  );

  it("toTypeNode with an unknown property name kind throws", () => {
    const name = { kind: "computed", text: "x" } as unknown as IrPropertyName;

    expect(() => toTypeNode(irObject([irProperty(name, irKeyword("string"))]))).toThrow(
      "Unexpected variant",
    );
  });
});
