import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `$ref`s into a property of a discriminator owner and to `unevaluatedProperties`: the original
 * pointer does not compile, or compiles through a wider index signature, so it is typed as its
 * target by default (ADR-026).
 */

const PET = {
  type: "object",
  required: ["petType"],
  properties: {
    petType: { type: "string" },
    owner: { type: "object", properties: { name: { type: "string" } } },
    tags: { type: "array", items: { type: "string" } },
  },
  discriminator: { propertyName: "petType" },
};
const STATS = {
  type: "object",
  properties: { total: { type: "integer" } },
  unevaluatedProperties: { type: "string" },
};
const SCHEMAS = {
  Pet: PET,
  Dog: { allOf: [{ $ref: "#/components/schemas/Pet" }, { type: "object", properties: { bark: { type: "boolean" } } }] },
  Stats: STATS,
  Only: { type: "object", unevaluatedProperties: { type: "string" } },
  Use: {
    type: "object",
    properties: {
      ownerName: { $ref: "#/components/schemas/Pet/properties/owner/properties/name" },
      tag: { $ref: "#/components/schemas/Pet/properties/tags/items" },
      extra: { $ref: "#/components/schemas/Stats/unevaluatedProperties" },
      only: { $ref: "#/components/schemas/Only/unevaluatedProperties" },
    },
  },
};

async function generate(options: OpenAPITSOptions = {}): Promise<string> {
  const document = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas: SCHEMAS },
  } as unknown as OpenAPI3;
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

const use = (key: string, value: string) => `const ${key}: components["schemas"]["Use"]["${key}"] = ${value};`;

describe("$refs into a discriminator owner's properties", () => {
  it("openapiTS reads through the properties of a discriminator owner, and the output compiles", async () => {
    const output = await generate();

    expect(output).toContain('ownerName?: NonNullable<components["schemas"]["Pet"]["owner"]>["name"];');
    expect(output).toContain('tag?: NonNullable<components["schemas"]["Pet"]["tags"]>[number];');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("$refs to unevaluatedProperties", () => {
  it.each([[[]], [["unevaluated-properties"]]] as const)(
    "openapiTS with fix %j types the $ref as its target, and the output compiles",
    async (fix) => {
      const output = await generate({ fix: [...fix] });

      expect(output).toContain("extra?: string;");
      expect(typeErrorsOf(output)).toEqual([]);
      expect(typeErrorsOf(`${output}\n${use("extra", "5")}`)).not.toEqual([]);
      expect(typeErrorsOf(`${output}\n${use("only", "5")}`)).not.toEqual([]);
      expect(typeErrorsOf(`${output}\n${use("only", '"text"')}`)).toEqual([]);
    },
  );
});
