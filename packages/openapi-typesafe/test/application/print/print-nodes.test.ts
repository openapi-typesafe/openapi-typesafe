import { describe, expect, it } from "vitest";
import { printNodes } from "../../../src/application/print/print-nodes.js";
import { irKeyword, irObject, irProperty } from "../../../src/domain/ir/constructors.js";
import type {
  IrComment,
  IrDeclaration,
  IrPropertyName,
  IrType,
} from "../../../src/domain/ir/nodes.js";

function alias(type: IrType, comments: readonly IrComment[] = []): IrDeclaration {
  return { kind: "typeAlias", name: "A", isExported: true, type, comments };
}

describe("printNodes", () => {
  it("printNodes with no declarations prints nothing", () => {
    expect(printNodes([])).toBe("");
  });

  it("printNodes uses the configured indentation and line break", () => {
    const type = irObject([irProperty({ kind: "identifier", text: "id" }, irKeyword("string"))]);

    expect(printNodes([alias(type)], { indentSize: 2, newLine: "\r\n" })).toBe(
      "export type A = {\r\n  id: string;\r\n};\r\n",
    );
  });

  it("printNodes writes a string literal without an encoding as JSON text", () => {
    const type: IrType = { kind: "stringLiteral", value: 'naïve "quoted"' };

    expect(printNodes([alias(type)])).toBe('export type A = "naïve \\"quoted\\"";\n');
  });

  it("printNodes writes raw declarations and raw types as given", () => {
    const raw: IrDeclaration = { kind: "rawDeclaration", text: "type B = 1;" };

    expect(printNodes([raw, alias({ kind: "raw", text: "B | 2" })])).toBe(
      "type B = 1;\nexport type A = B | 2;\n",
    );
  });

  it("printNodes indents the continuation lines of a nested raw type", () => {
    const type = irObject([
      irProperty({ kind: "identifier", text: "a" }, { kind: "raw", text: "{\n    b: 1;\n\n}" }),
    ]);

    expect(printNodes([alias(type)])).toBe(
      "export type A = {\n    a: {\n        b: 1;\n\n    };\n};\n",
    );
  });

  it("printNodes with an unknown declaration kind throws", () => {
    expect(() => printNodes([{ kind: "module" } as unknown as IrDeclaration])).toThrow(
      "Unexpected variant",
    );
  });

  it("printNodes with an unknown type kind throws", () => {
    expect(() => printNodes([alias({ kind: "conditional" } as unknown as IrType)])).toThrow(
      "Unexpected variant",
    );
  });

  it("printNodes with an unknown property name kind throws", () => {
    const name = { kind: "computed", text: "x" } as unknown as IrPropertyName;

    expect(() => printNodes([alias(irObject([irProperty(name, irKeyword("string"))]))])).toThrow(
      "Unexpected variant",
    );
  });

  it("printNodes with an unknown comment kind throws", () => {
    const comment = { kind: "doc", text: "x" } as unknown as IrComment;

    expect(() => printNodes([alias(irKeyword("string"), [comment])])).toThrow("Unexpected variant");
  });
});
