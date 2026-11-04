import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum-values` arrays are typed through `FlattenedDeepRequired`, which did not look through
 * readonly arrays (`--immutable`, upstream #2714, #2749) or nullable parents (upstream #2737).
 */

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: {
    schemas: {
      Filter: {
        type: "object",
        properties: {
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string", enum: ["description", "amount"] } },
            },
          },
          submission: {
            type: ["object", "null"],
            properties: { status: { type: "string", enum: ["draft", "submitted"] } },
          },
        },
      },
    },
  },
};

async function generate(options: { immutable?: boolean }): Promise<string> {
  const nodes = await openapiTS(structuredClone(DOCUMENT), { silent: true, enumValues: true, ...options });
  return astToString(nodes);
}

describe("--enum-values helper types", () => {
  it.each([[{}], [{ immutable: true }]])("the output with %j compiles", async (options) => {
    const output = await generate(options);

    expect(output).toContain("export const filterFieldsNameValues");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("enum values arrays declared once", () => {
  it("openapiTS with enumValues declares an array once when a schema is typed twice", async () => {
    const pair = { type: "array", prefixItems: [{ enum: ["a", "b"] }, { enum: ["a", "b"] }] };
    const document = { ...DOCUMENT, components: { schemas: { Pair: pair } } } as OpenAPI3;

    const output = astToString(await openapiTS(document, { silent: true, enumValues: true }));

    expect(output.match(/export const pairValues/g)).toHaveLength(1);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("enum values arrays of one name", () => {
  const enumOf = (values: string[]) => ({ type: "string", enum: values });
  /**
   * `Discount/type` and `discount/type` give one name; so do a property and an inline `allOf` item
   * of one schema, which are typed at the same location.
   */
  const SCHEMAS = {
    Discount: { type: "object", properties: { type: enumOf(["fixed", "percent"]) } },
    discount: { type: "object", properties: { type: enumOf(["percent", "fixed"]) } },
    Issue: {
      type: "object",
      properties: { state: enumOf(["open", "closed"]) },
      allOf: [{ type: "object", properties: { state: enumOf(["closed", "open"]) } }],
    },
  };

  async function generateWith(schemas: Record<string, unknown>): Promise<string> {
    const document = { ...DOCUMENT, components: { schemas } } as OpenAPI3;
    return astToString(await openapiTS(structuredClone(document), { silent: true, enumValues: true }));
  }

  it("openapiTS with enumValues numbers the later arrays, so the output compiles", async () => {
    const output = await generateWith(SCHEMAS);

    expect([...output.matchAll(/^export const (\S+):/gm)].map((match) => match[1])).toEqual([
      "discountTypeValues",
      "discountTypeValues_2",
      "issueStateValues",
      "issueStateValues_2",
    ]);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with enumValues keeps the name of an array no other array has", async () => {
    const { Discount } = SCHEMAS;

    expect(await generateWith({ Discount })).toContain("export const discountTypeValues: ");
  });
});
