import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";

/** `lint: false` skips the Redocly lint step (upstream #2840, #2845). */

// Two operations with the same ID: the default config makes that a lint error.
const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {
    "/a": { get: { operationId: "same", responses: { 200: { description: "OK" } } } },
    "/b": { get: { operationId: "same", responses: { 200: { description: "OK" } } } },
  },
};

describe("the lint option", () => {
  it("openapiTS lints by default and fails on a lint error", async () => {
    await expect(openapiTS(structuredClone(DOCUMENT), { silent: true })).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });
  });

  it("openapiTS with lint: false skips the lint and generates the types", async () => {
    const output = astToString(await openapiTS(structuredClone(DOCUMENT), { silent: true, lint: false }));

    expect(output).toContain('"/a": {');
  });
});
