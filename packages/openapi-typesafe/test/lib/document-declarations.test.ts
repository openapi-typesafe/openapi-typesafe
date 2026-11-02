import ts from "typescript";
import { describe, expect, it } from "vitest";
import { toStatements } from "../../src/adapters/type-ast-bridge/ir-to-typescript.js";
import { printWithTypeScript } from "../../src/adapters/type-ast-bridge/print-typescript.js";
import openapiTS, { astToString } from "../../src/index.js";
import type { OpenAPI3, OpenAPITSOptions } from "../../src/types.js";

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        responses: { 200: { description: "OK" } },
      },
    },
  },
  components: {
    schemas: { Status: { type: "string", enum: ["a", "b"] } },
  },
};

/** The IR path (`astToString(await openapiTS())`) and the same IR printed by TypeScript. */
async function printBoth(options: OpenAPITSOptions) {
  const declarations = await openapiTS(DOCUMENT, { silent: true, ...options });
  return {
    ir: astToString(declarations),
    typescript: printWithTypeScript(
      ts,
      declarations.flatMap((node) => toStatements(ts, node)),
    ),
  };
}

describe("documentDeclarations", () => {
  it("openapiTS returns IR declarations", async () => {
    const declarations = await openapiTS(DOCUMENT, { silent: true });

    expect(declarations.every((declaration) => typeof declaration.kind === "string")).toBe(true);
  });

  it("the IR prints what the TypeScript printer prints for the same run", async () => {
    const { ir, typescript } = await printBoth({ enum: true, enumValues: true, inject: "type A=1" });

    expect(ir).toBe(typescript);
    expect(ir).toContain("type A = 1;");
  });

  it("a footer node added by a user callback is printed", async () => {
    const transform: OpenAPITSOptions["transform"] = (_schema, options) => {
      const [node] = ts.createSourceFile("u.ts", "type User = 1;", ts.ScriptTarget.ESNext).statements;
      options.ctx.injectFooter.push(node as ts.Node);
      return undefined;
    };

    const { ir, typescript } = await printBoth({ transform });

    expect(ir).toBe(typescript);
    expect(ir).toContain("type User = 1;");
  });

  it("injected code without statements is skipped", async () => {
    const { ir, typescript } = await printBoth({ inject: "   " });

    expect(ir).toBe(typescript);
  });
});

describe("astToString", () => {
  it("astToString with TypeScript nodes, or with options, uses the TypeScript printer", async () => {
    const declarations = await openapiTS(DOCUMENT, { silent: true });
    const [node] = ts.createSourceFile("u.ts", "type U = 1;", ts.ScriptTarget.ESNext).statements;

    const mixed = astToString([...declarations, node as ts.Node]);
    const withOptions = astToString(declarations, { formatOptions: {} });

    expect(mixed).toBe(`${astToString(declarations)}type U = 1;\n`);
    expect(withOptions).toBe(astToString(declarations));
  });
});
