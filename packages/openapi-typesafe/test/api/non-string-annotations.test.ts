import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type SchemaObject } from "../../src/index.js";

/** A non-string `summary` or `title` does not crash the generator (upstream #2349). */

// `properties:` is missing under `data`, so `summary` is read as the keyword, not a property.
const DATA = { type: "object", summary: { type: "array" } } as unknown as SchemaObject;
const NAME = { type: "string", title: { type: "string" } } as unknown as SchemaObject;

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: {
    schemas: { Report: { type: "object", properties: { data: DATA, name: NAME } } },
  },
};

describe("non-string schema annotations", () => {
  it("openapiTS generates the properties without a comment from the object", async () => {
    const output = astToString(await openapiTS(structuredClone(DOCUMENT), { silent: true }));

    expect(output).toContain("data?: Record<string, never>;");
    expect(output).toContain("name?: string;");
  });
});
