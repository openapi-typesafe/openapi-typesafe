import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `$ref`s that the original types through an index signature: to `additionalProperties` next to
 * `properties` (whose types the signature holds too), to a pattern of `patternProperties`, and to
 * a property `--exclude-deprecated` leaves out.
 */

const ENTRY = { type: "object", properties: { count: { type: "integer" } } };
const STATS = {
  type: "object",
  required: ["total"],
  properties: { total: { type: "integer" } },
  additionalProperties: ENTRY,
};
const STATS_PATH = "#/paths/~1stats/get/responses/200/content/application~1json/schema";

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  const content = { "application/json": { schema: STATS } };
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: { "/stats": { get: { responses: { 200: { description: "ok", content } } } } },
    components: { schemas: { Stats: STATS, ...schemas } },
  } as unknown as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

const S = 'components["schemas"]';

describe("$ref to additionalProperties next to properties", () => {
  const document = documentWith({
    Entry: { $ref: "#/components/schemas/Stats/additionalProperties" },
    EntryCount: { $ref: "#/components/schemas/Stats/additionalProperties/properties/count" },
    PathEntry: { $ref: `${STATS_PATH}/additionalProperties` },
    PathEntryCount: { $ref: `${STATS_PATH}/additionalProperties/properties/count` },
  });
  const check = `
const count: ${S}["EntryCount"] = 1;
const pathCount: ${S}["PathEntryCount"] = 1;
// @ts-expect-error a number is no entry
const entry: ${S}["Entry"] = 5;
// @ts-expect-error a number is no entry
const pathEntry: ${S}["PathEntry"] = 5;`;

  it("openapiTS types the additionalProperties schema itself, and compiles", async () => {
    const output = await generate(document);

    expect(output).toContain("EntryCount: number;");
    expect(output).not.toContain('["additionalProperties"]');
    expect(typeErrorsOf(`${output}${check}`)).toEqual([]);
  });

  it("openapiTS with the ref-pointers fix types it in place instead of indexing by string", async () => {
    const output = await generate(document, { fix: ["ref-pointers"] });

    expect(output).not.toContain("[string]");
    expect(typeErrorsOf(`${output}${check}`)).toEqual([]);
  });

  it("openapiTS keeps the index of additionalProperties without properties", async () => {
    const map = { type: "object", additionalProperties: ENTRY };
    const output = await generate(
      documentWith({ Map: map, Value: { $ref: "#/components/schemas/Map/additionalProperties" } }),
    );

    expect(output).toContain(`Value: ${S}["Map"]["additionalProperties"];`);
  });
});

describe("$ref to a pattern of patternProperties", () => {
  const labels = {
    type: "object",
    patternProperties: { "^label_": { type: "object", properties: { text: { type: "string" } } } },
  };

  it("openapiTS types the pattern's schema, and compiles", async () => {
    const output = await generate(
      documentWith({ Labels: labels, Label: { $ref: "#/components/schemas/Labels/patternProperties/^label_" } }),
    );

    expect(output).not.toContain('["patternProperties"]');
    expect(typeErrorsOf(`${output}\nconst label: ${S}["Label"] = { text: "a" };`)).toEqual([]);
  });
});

describe("--exclude-deprecated $ref to a left-out property next to an index signature", () => {
  const uses = {
    type: "object",
    properties: { legacyName: { type: "string", deprecated: true }, count: { type: "integer" } },
    additionalProperties: { type: "integer" },
  };

  it("openapiTS types the property's schema, not the index signature", async () => {
    const output = await generate(
      documentWith({ Uses: uses, ToDep: { $ref: "#/components/schemas/Uses/properties/legacyName" } }),
      { excludeDeprecated: true },
    );

    expect(output).toContain("ToDep: string;");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
