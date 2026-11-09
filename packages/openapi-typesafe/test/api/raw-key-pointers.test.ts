import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type SchemaObject } from "../../src/index.js";

/**
 * A document key is one pointer segment. The generator read a key that contains `#/` as a
 * `$ref`, so a malformed percent escape after it threw URIError, and any other such key named
 * the node by the text after its last `#/` (`a#/b` became `b`).
 */

const KEYS = ["a#/b", "#/%41", "#/% x", "50%", "a#"] as const;

function document(): OpenAPI3 {
  const parameters = KEYS.map((key) => ({ name: key, in: "query" as const, schema: rated("p") }));
  const content = Object.fromEntries(KEYS.map((key) => [`text/${key}`, { schema: rated("m") }]));
  return {
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0.0" },
    paths: Object.fromEntries(
      KEYS.map((key) => [`/items/${key}`, { get: { parameters, responses: { 200: { description: "OK", content } } } }]),
    ),
    components: {
      schemas: {
        Rate: {
          type: "object",
          properties: Object.fromEntries(KEYS.map((key) => [key, rated("v")])),
        },
      },
    },
  };
}

function rated(value: string): { type: "string"; enum: string[] } {
  return { type: "string", enum: [value] };
}

async function generate(options: { enum?: boolean; enumValues?: boolean }): Promise<string> {
  return astToString(await openapiTS(document(), { silent: true, ...options }));
}

describe("document keys that look like a $ref", () => {
  it.each([{}, { enum: true }, { enumValues: true }])("openapiTS with %j generates", async (options) => {
    await expect(generate(options)).resolves.toContain('"#/% x"?: ');
  });

  it("enum names hold the whole key", async () => {
    const output = await generate({ enum: true });

    expect(output).toContain("export enum RateAB {");
    expect(output).toContain("export enum Rate41 {");
    expect(output).toContain("export enum RateX {");
    expect(output).toContain("export enum PathsItemsAGetParametersQueryA {");
  });

  it("enum values arrays point at the node of their key", async () => {
    const output = await generate({ enumValues: true });

    expect(output).toContain('FlattenedDeepRequired<components>["schemas"]["Rate"]["a#/b"]');
    expect(output).toContain('FlattenedDeepRequired<components>["schemas"]["Rate"]["#/%41"]');
    expect(output).toContain('FlattenedDeepRequired<paths>["/items/a#"]["get"]');
    expect(output).toContain('["content"]["text/#/% x"]');
  });
});

/**
 * Schema names with `#` or `%` in a discriminator. Redocly writes a bundled `mapping` value
 * percent-decoded while `$ref`s keep their escapes, so the pointers are compared canonically.
 */
function discriminatedDocument(name: string, written: string): OpenAPI3 {
  const base: SchemaObject = {
    type: "object",
    required: ["t"],
    properties: { t: { type: "string" } },
    discriminator: { propertyName: "t", mapping: { x: `#/components/schemas/${written}` } },
  };
  const child: SchemaObject = {
    type: "object",
    allOf: [{ $ref: "#/components/schemas/Base" }, { type: "object", properties: { bark: { type: "boolean" } } }],
  };
  return {
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0.0" },
    paths: {},
    components: { schemas: { Base: base, [name]: child } },
  };
}

describe("discriminators of schemas whose names hold # or %", () => {
  it.each([
    ["a#b", "a#b"],
    ["a#b", "a%23b"],
    ["50%", "50%25"],
  ])("the mapping to %j written as %j gives its value", async (name, written) => {
    const output = astToString(await openapiTS(discriminatedDocument(name, written), { silent: true }));

    expect(output).toContain('t: "x";');
  });
});
