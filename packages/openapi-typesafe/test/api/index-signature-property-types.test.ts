import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * Properties next to a typed `additionalProperties`: TypeScript checks the index signature against
 * the declared keys too, so the signature must take the property types.
 */

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas },
  } as unknown as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>): Promise<string> {
  return astToString(await openapiTS(documentWith(schemas), { silent: true }));
}

const ORDER = {
  type: "object",
  required: ["total"],
  properties: { total: { type: "integer" }, note: { type: "string" } },
  additionalProperties: { type: "string" },
};

describe("index signatures next to properties", () => {
  it("openapiTS adds the property types the index signature does not admit", async () => {
    const output = await generate({ Order: ORDER });

    expect(output).toContain("[key: string]: string | number;");
  });

  it("openapiTS output takes a value with the properties and other keys", async () => {
    const output = await generate({ Order: ORDER });

    const usage = `const order: components["schemas"]["Order"] = { total: 1, note: "n", extra: "e" };`;
    expect(typeErrorsOf(`${output}\n${usage}`)).toEqual([]);
  });

  it("openapiTS adds a $ref property type, which is not proven to fit", async () => {
    const output = await generate({
      Total: { type: "integer" },
      Order: { ...ORDER, properties: { total: { $ref: "#/components/schemas/Total" } } },
    });

    expect(output).toContain('[key: string]: string | components["schemas"]["Total"];');
    const usage = `const order: components["schemas"]["Order"] = { total: 1, extra: "e" };`;
    expect(typeErrorsOf(`${output}\n${usage}`)).toEqual([]);
  });

  it("openapiTS adds each property type member once, as one flat union", async () => {
    const nullable = { type: ["integer", "null"] };
    const output = await generate({
      Order: {
        ...ORDER,
        properties: { total: nullable, count: nullable, one: { type: "integer", enum: [1] } },
      },
    });

    expect(output).toContain("[key: string]: string | number | null;");
  });

  it("openapiTS prints an index signature without added property types as before", async () => {
    const output = await generate({
      Bag: { type: "object", additionalProperties: { type: ["null"], nullable: true } },
    });

    expect(output).toContain("[key: string]: null | null;");
  });

  it("openapiTS keeps an index signature that admits every property", async () => {
    const output = await generate({
      Labels: { ...ORDER, properties: { name: { type: "string" } }, required: [] },
    });

    expect(output).toContain("[key: string]: string;");
  });

  it("openapiTS keeps an unknown index signature", async () => {
    const output = await generate({ Bag: { ...ORDER, additionalProperties: true } });

    expect(output).toContain("[key: string]: unknown;");
  });

  it("openapiTS does not add the $defs type to the index signature", async () => {
    const output = await generate({
      Order: { ...ORDER, properties: { note: { type: "string" } }, $defs: { Id: { type: "integer" } } },
    });

    expect(output).toContain("[key: string]: string;");
  });
});
