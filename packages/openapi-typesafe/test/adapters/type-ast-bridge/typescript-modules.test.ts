import { createRequire } from "node:module";
import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  toPropertySignature,
  toTypeNode,
} from "../../../src/adapters/type-ast-bridge/ir-to-typescript.js";
import type { TypeScriptModule } from "../../../src/adapters/type-ast-bridge/load-typescript.js";
import { printTypeScriptNode } from "../../../src/adapters/type-ast-bridge/typescript-raw-text.js";
import {
  fromPropertySignature,
  fromTypeNode,
} from "../../../src/adapters/type-ast-bridge/typescript-to-ir.js";
import { printNodes } from "../../../src/application/print/print-nodes.js";
import { irProperty, irReference } from "../../../src/domain/ir/constructors.js";
import type { IrType } from "../../../src/domain/ir/nodes.js";
import { arbitraryType } from "../../print-parity/ir-arbitraries.js";
import { alias } from "../../print-parity/print-parity.fixtures.js";

/**
 * ENGINEERING_PLAN 6.4: the bridge works with the module the user's nodes come from: TypeScript 5.9
 * (the workspace version) and `@typescript/typescript6` (for TypeScript 7 projects).
 */

const require = createRequire(import.meta.url);
const MODULES: readonly [string, TypeScriptModule][] = [
  [`typescript ${ts.version}`, ts],
  ["@typescript/typescript6", require("@typescript/typescript6") as TypeScriptModule],
];
const RUNS = 500;

describe.each(MODULES)("bridge with %s", (_, module) => {
  it("IR converted to nodes prints like our printer prints the IR", () => {
    fc.assert(
      fc.property(arbitraryType, (type: IrType) => {
        const statement = module.factory.createTypeAliasDeclaration(
          [module.factory.createModifier(module.SyntaxKind.ExportKeyword)],
          "T",
          undefined,
          toTypeNode(module, type),
        );

        expect(`${printTypeScriptNode(module, statement)}\n`).toBe(printNodes([alias("T", type)]));
      }),
      { numRuns: RUNS },
    );
  });

  it("nodes read back into IR print the same", () => {
    fc.assert(
      fc.property(arbitraryType, (type: IrType) => {
        const read = fromTypeNode(module, toTypeNode(module, type));

        expect(printNodes([alias("T", read)])).toBe(printNodes([alias("T", type)]));
      }),
      { numRuns: RUNS },
    );
  });

  it("a property built by a legacy transformProperty callback is read into IR", () => {
    const property = irProperty({ kind: "identifier", text: "a" }, irReference("A"), {
      isOptional: true,
    });
    const node = module.factory.updatePropertySignature(
      toPropertySignature(module, property),
      [module.factory.createModifier(module.SyntaxKind.ReadonlyKeyword)],
      module.factory.createIdentifier("a"),
      module.factory.createToken(module.SyntaxKind.QuestionToken),
      module.factory.createKeywordTypeNode(module.SyntaxKind.StringKeyword),
    );

    expect(fromPropertySignature(module, node)).toEqual({
      ...property,
      isReadonly: true,
      type: { kind: "keyword", keyword: "string" },
    });
  });
});
