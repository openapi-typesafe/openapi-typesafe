import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";

/** `--default-non-nullable`: a default makes an output property required, never an input one. */

const PAGE = { type: "object", properties: { page: { type: "integer", default: 1 } } };
const JSON_PAGE = { "application/json": { schema: PAGE } };

const DOCUMENT = {
  openapi: "3.0.3",
  info: { title: "t", version: "1" },
  paths: {
    "/system-parameters": {
      get: { responses: { 200: { description: "ok", content: JSON_PAGE } } },
      post: { requestBody: { content: JSON_PAGE }, responses: { 204: { description: "ok" } } },
    },
  },
  components: {
    schemas: {
      Job: { type: "object", properties: { parameters: PAGE } },
    },
  },
} as unknown as OpenAPI3;

describe("default and required inputs", () => {
  it("openapiTS makes a defaulted property of a response under a parameters path required", async () => {
    const output = astToString(await openapiTS(DOCUMENT, { silent: true }));

    expect(output).toMatch(/200: \{\n(?:.*\n){4}\s+"application\/json": \{\n(?:.*\n){1}\s+page: number;/);
  });

  it("openapiTS keeps a defaulted property of a request body optional", async () => {
    const output = astToString(await openapiTS(DOCUMENT, { silent: true }));

    expect(output).toMatch(/requestBody\?: \{\n(?:.*\n){2}\s+\/\*\* @default 1 \*\/\n\s+page\?: number;/);
  });

  it("openapiTS makes a defaulted property of a schema property named parameters required", async () => {
    const output = astToString(await openapiTS(DOCUMENT, { silent: true }));

    expect(output).toMatch(/parameters\?: \{\n\s+\/\*\* @default 1 \*\/\n\s+page: number;/);
  });
});
