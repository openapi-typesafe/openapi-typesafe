import ts from "typescript";
import { describe, expect, it } from "vitest";
import { generateTypes } from "../src/generate.js";
import openapiTS, { astToString } from "../src/index.js";
import type { OpenAPI3, OpenAPITSOptions } from "../src/types.js";

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

async function printBoth(options: OpenAPITSOptions) {
  return {
    ir: await generateTypes(DOCUMENT, { silent: true, ...options }),
    typescript: astToString(await openapiTS(DOCUMENT, { silent: true, ...options })),
  };
}

describe("generateTypes", () => {
  it("generateTypes prints what astToString prints for openapiTS", async () => {
    const { ir, typescript } = await printBoth({ enum: true, enumValues: true, inject: "type A=1" });

    expect(ir).toBe(typescript);
    expect(ir).toContain("type A = 1;");
  });

  it("generateTypes prints a footer node added by a user callback", async () => {
    const transform: OpenAPITSOptions["transform"] = (_schema, options) => {
      const [node] = ts.createSourceFile("u.ts", "type User = 1;", ts.ScriptTarget.ESNext).statements;
      options.ctx.injectFooter.push(node as ts.Node);
      return undefined;
    };

    const { ir, typescript } = await printBoth({ transform });

    expect(ir).toBe(typescript);
    expect(ir).toContain("type User = 1;");
  });

  it("generateTypes skips injected code without statements", async () => {
    const { ir, typescript } = await printBoth({ inject: "   " });

    expect(ir).toBe(typescript);
  });
});
