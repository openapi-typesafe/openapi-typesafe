import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * A schema `$ref` into another schema's keywords (`content/<media type>/schema`, `items`,
 * `allOf/0`) was indexed by the keyword names, which the generated types do not have (TS2339).
 */

const LIST = "#/paths/~1items/get/responses/200/content/application~1json/schema";

const DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {
    "/items": {
      get: {
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { type: "object", properties: { time: { type: "string" } } },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Base: {
        allOf: [{ type: "object", properties: { id: { type: "integer" } } }],
      },
      List: {
        type: "object",
        properties: {
          rows: {
            type: ["array", "null"],
            items: { type: "object", properties: { name: { type: "string" } } },
          },
        },
      },
      Copy: {
        type: "object",
        properties: {
          time: { $ref: `${LIST}/items/properties/time` },
          id: { $ref: "#/components/schemas/Base/allOf/0/properties/id" },
          name: { $ref: "#/components/schemas/List/properties/rows/items/properties/name" },
        },
      },
    },
  },
} as unknown as OpenAPI3;

describe("schema $refs into schema keywords", () => {
  it("openapiTS maps the keywords to the generated shape and the output compiles", async () => {
    const output = astToString(await openapiTS(structuredClone(DOCUMENT), { silent: true }));

    expect(output).toContain(
      'time?: NonNullable<paths["/items"]["get"]["responses"]["200"]["content"]["application/json"]>[number]["time"];',
    );
    expect(output).toContain('id?: components["schemas"]["Base"]["id"];');
    expect(output).toContain('name?: NonNullable<components["schemas"]["List"]["rows"]>[number]["name"];');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
