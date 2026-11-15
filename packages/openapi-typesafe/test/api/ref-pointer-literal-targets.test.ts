import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * A schema `$ref` through a schema the generator types as a literal (an `enum`, a `const`) or
 * without a `$defs` member: the literal union or TypeScript enum has no such key, so the original
 * index does not compile, and the `$ref` gets the type it points at (ADR-026).
 */

const SORT = { type: "string", enum: ["asc", "desc"] };
const KIND = { type: "string", enum: ["k1", "k2"] };
const DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  paths: {},
  components: {
    parameters: {
      Sort: { name: "sort", in: "query", schema: SORT },
      Page: { name: "page", in: "query", schema: { type: "integer" } },
      Kind: { name: "kind", in: "query", schema: { $ref: "#/components/schemas/Kind" } },
    },
    headers: { Mode: { schema: { type: "string", enum: ["fast", "slow"] } } },
    schemas: {
      Kind: KIND,
      Color: { oneOf: [{ const: "red" }, { const: "blue" }] },
      Status: {
        anyOf: [
          { type: "string", enum: ["active"] },
          { type: "string", enum: ["archived"] },
        ],
      },
      Level: { allOf: [{ type: "string", enum: ["low", "high"] }] },
      Coded: { ...KIND, $defs: { Code: { type: "string", enum: ["c1"] } } },
      Pair: { type: "array", prefixItems: [{ type: "string" }], $defs: { Code: { type: "string" } } },
      SortRef: { $ref: "#/components/parameters/Sort/schema" },
      PageRef: { $ref: "#/components/parameters/Page/schema" },
      KindRef: { $ref: "#/components/parameters/Kind/schema" },
      ModeRef: { $ref: "#/components/headers/Mode/schema" },
      BlueRef: { $ref: "#/components/schemas/Color/oneOf/1" },
      ActiveRef: { $ref: "#/components/schemas/Status/anyOf/0" },
      LevelRef: { $ref: "#/components/schemas/Level/allOf/0" },
      CodeRef: { $ref: "#/components/schemas/Coded/$defs/Code" },
      PairCodeRef: { $ref: "#/components/schemas/Pair/$defs/Code" },
    },
  },
} as unknown as OpenAPI3;

async function generate(options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(structuredClone(DOCUMENT), { silent: true, ...options }));
}

describe("schema $refs through literal types", () => {
  it.each([
    ["the enum schema of a parameter", "SortRef", 'components["parameters"]["Sort"]'],
    ["a parameter schema $ref to an enum", "KindRef", 'components["parameters"]["Kind"]'],
    ["the enum schema of a header", "ModeRef", 'components["headers"]["Mode"]'],
    ["a const variant", "BlueRef", '"blue"'],
    ["an enum variant", "ActiveRef", '"active"'],
    ["an enum allOf item", "LevelRef", '"low" | "high"'],
    ["a $defs entry of an enum", "CodeRef", '"c1"'],
    ["a $defs entry of a tuple", "PairCodeRef", "string"],
  ])("openapiTS types a $ref to %s as its target", async (_target, name, type) => {
    const output = await generate();

    expect(output).toContain(`${name}: ${type};`);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types a parameter's schema as the parameter, as for a schema of no literal", async () => {
    const output = await generate();

    expect(output).toContain('PageRef: components["parameters"]["Page"];');
    expect(output).not.toContain('["schema"]');
  });

  it("openapiTS with --enum types such a $ref with the enum of its target", async () => {
    const output = await generate({ enum: true });

    expect(output).toContain("ActiveRef: StatusAnyOf0;");
    expect(output).toContain("LevelRef: Level;");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
