import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";

/**
 * `--default-non-nullable`: a default makes an output property required, never an input one. The
 * original finds inputs by words in the location; the `default-input-locations` fix (ADR-021) by
 * the document's structure.
 */

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

const RESPONSE_PAGE = /200: \{\n(?:.*\n){4}\s+"application\/json": \{\n(?:.*\n){1}\s+page(\??): number;/;
const BODY_PAGE = /requestBody\?: \{\n(?:.*\n){2}\s+\/\*\* @default 1 \*\/\n\s+page(\??): number;/;
const PARAMETERS_PAGE = /parameters\?: \{\n\s+\/\*\* @default 1 \*\/\n\s+page(\??): number;/;

async function optionalMarks(fix: readonly "default-input-locations"[]): Promise<string[]> {
  const output = astToString(await openapiTS(DOCUMENT, { silent: true, fix }));
  return [RESPONSE_PAGE, BODY_PAGE, PARAMETERS_PAGE].map((pattern) => output.match(pattern)?.[1] ?? "none");
}

describe("default-input-locations fix", () => {
  it("openapiTS without the fix keeps defaulted properties optional where the location names an input", async () => {
    const [response, body, parameters] = await optionalMarks([]);

    expect([response, body, parameters]).toEqual(["?", "?", "?"]);
  });

  it("openapiTS with the fix makes them required in a response and a property named parameters", async () => {
    const [response, body, parameters] = await optionalMarks(["default-input-locations"]);

    expect([response, body, parameters]).toEqual(["", "?", ""]);
  });
});
