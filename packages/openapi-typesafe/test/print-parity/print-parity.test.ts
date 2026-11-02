import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { toStatement } from "../../src/adapters/type-ast-bridge/ir-to-typescript.js";
import { printNodes } from "../../src/application/print/print-nodes.js";
import type { IrDeclaration } from "../../src/domain/ir/nodes.js";
import { astToString } from "../../src/index.js";
import { arbitraryDeclarations } from "./ir-arbitraries.js";
import { alias, DECLARATION_CASES, TYPE_CASES } from "./print-parity.fixtures.js";

/**
 * What the original generator prints for the same declarations: TypeScript factory nodes + printer.
 */
function printWithTypeScript(declarations: readonly IrDeclaration[]): string {
  return astToString(declarations.map((node) => toStatement(ts, node)));
}

/** Random IR trees are large; this many runs keeps the suite under a few seconds. */
const STRUCTURE_RUNS = 2_000;

describe("printNodes parity with the TypeScript printer", () => {
  it.each(Object.entries(TYPE_CASES))("printNodes prints %s like TypeScript", (_name, type) => {
    const declarations = [alias("T", type)];

    expect(printNodes(declarations)).toBe(printWithTypeScript(declarations));
  });

  it.each(Object.entries(DECLARATION_CASES))(
    "printNodes prints %s like TypeScript",
    (_name, declarations) => {
      expect(printNodes(declarations)).toBe(printWithTypeScript(declarations));
    },
  );

  it("printNodes prints random IR trees like TypeScript", () => {
    fc.assert(
      fc.property(arbitraryDeclarations, (declarations) => {
        expect(printNodes(declarations)).toBe(printWithTypeScript(declarations));
      }),
      { numRuns: STRUCTURE_RUNS },
    );
  });
});
