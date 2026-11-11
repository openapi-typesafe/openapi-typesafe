import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `$ref`s through an index signature that holds other types, without `--fix`: a `$defs` owner, a
 * discriminator owner and several value schemas are typed as the target (ADR-026).
 */

const INTEGER = { type: "integer" };
const SCHEMAS = {
  Use: {
    type: "object",
    properties: {
      a: { $ref: "#/components/schemas/Both/additionalProperties" },
      b: { $ref: "#/components/schemas/Both/patternProperties/^x" },
      c: { $ref: "#/components/schemas/Two/patternProperties/^a" },
      d: { $ref: "#/components/schemas/D/$defs/Inner/additionalProperties" },
      e: { $ref: "#/components/schemas/Tagged/additionalProperties" },
      o: { type: "array", items: { $ref: "#/components/schemas/Tagged/properties/old" } },
    },
  },
  Both: { type: "object", additionalProperties: INTEGER, patternProperties: { "^x": { type: "string" } } },
  Two: { type: "object", patternProperties: { "^a": INTEGER, "^b": { type: "string" } } },
  D: {
    type: "object",
    $defs: {
      Inner: { type: "object", properties: { z: { type: "string" } }, additionalProperties: { type: "boolean" } },
    },
  },
  Tagged: {
    type: "object",
    required: ["kind"],
    properties: { kind: { type: "string" }, old: { type: "string", deprecated: true } },
    discriminator: { propertyName: "kind" },
    additionalProperties: INTEGER,
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

describe("$refs through index signatures of other types", () => {
  it("openapiTS types each such $ref as its target, and the output compiles", async () => {
    const output = await generate();

    expect(output).toContain("a?: number;");
    expect(output).toContain("b?: string;");
    expect(output).toContain("c?: number;");
    expect(output).toContain("d?: boolean;");
    expect(output).toContain("e?: number;");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS rejects a value the target does not admit", async () => {
    const output = await generate();

    for (const key of ["a", "d", "e"]) {
      expect(typeErrorsOf(`${output}\n${use(key, '"text"')}`)).not.toEqual([]);
    }
  });

  it("openapiTS types a $ref to a left-out property of a discriminator owner as the property", async () => {
    const output = await generate({ excludeDeprecated: true });

    expect(output).toContain("o?: string[];");
    expect(typeErrorsOf(`${output}\n${use("o", "[5]")}`)).not.toEqual([]);
  });
});
