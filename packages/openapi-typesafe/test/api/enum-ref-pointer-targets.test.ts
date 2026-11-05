import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * A `$ref` target written inline (ADR-026) is typed where the generator types the node, so with
 * `--enum` it uses the enum the generator declares for that node, not a second one named after
 * the pointer (two TypeScript enums with the same members are not assignable to each other).
 */

const STATUS = { type: "string", enum: ["on", "off"] };
const DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {
    "/a": {
      parameters: [{ name: "p", in: "header", schema: { type: "string", enum: ["p1"] } }],
      get: {
        parameters: [{ name: "st", in: "query", schema: { type: "string", enum: ["q1", "q2"] } }],
        responses: { 200: { description: "OK" } },
      },
    },
  },
  components: {
    schemas: {
      Base: { allOf: [{ type: "object", properties: { status: STATUS } }] },
      Map: { type: "object", additionalProperties: { type: "string", enum: ["m1"] } },
      Use: {
        type: "object",
        properties: {
          s: { $ref: "#/components/schemas/Base/allOf/0/properties/status" },
          o: { $ref: "#/components/schemas/Base/allOf/0" },
          q: { $ref: "#/paths/~1a/get/parameters/0/schema" },
          p: { $ref: "#/paths/~1a/parameters/0/schema" },
          m: { $ref: "#/components/schemas/Map/additionalProperties" },
        },
      },
    },
  },
} as unknown as OpenAPI3;

/** Values of the inline targets assigned where the generator types the same nodes. */
const ASSIGNMENTS = `
declare const use: components["schemas"]["Use"];
export const base: components["schemas"]["Base"] = { status: use.s };
export const copy: components["schemas"]["Base"] = { status: use.o?.status };
export const query: NonNullable<paths["/a"]["get"]["parameters"]["query"]> = { st: use.q };
export const header: NonNullable<paths["/a"]["parameters"]["header"]> = { p: use.p };
export const map: components["schemas"]["Map"] = { key: use.m! };
`;

async function generate(options: object): Promise<string> {
  return astToString(await openapiTS(DOCUMENT, { silent: true, ...options }));
}

describe("--enum with inline $ref targets", () => {
  it("openapiTS types an inline target with the enum the generator declares for it", async () => {
    const output = await generate({ enum: true });

    expect(output).toContain("s?: BaseStatus;");
    expect(output).toContain("q?: PathsAGetParametersQuerySt;");
    expect(output).toContain("p?: PathsAParametersParametersHeaderP;");
    expect(output).not.toContain("BaseAllOf0");
    expect(output).not.toContain("Parameters0Schema");
    expect(output.match(/export enum BaseStatus /g)).toHaveLength(1);
    expect(typeErrorsOf(output + ASSIGNMENTS)).toEqual([]);
  });

  it("openapiTS declares no --enum-values array for an inline target", async () => {
    const output = await generate({ enumValues: true });

    expect(output.match(/\w*StatusValues/g)).toEqual(["baseStatusValues"]);
    expect(output).not.toContain("Parameters0SchemaValues");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
