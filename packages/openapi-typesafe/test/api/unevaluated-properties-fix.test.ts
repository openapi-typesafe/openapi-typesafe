import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `unevaluated-properties` fix (ADR-021, roadmap R11, upstream #2839, #2880). */

const ID = { id: { type: "integer" } };
const STRING = { type: "string" };
const BASE = { type: "object", required: ["id"], properties: ID };
const BASE_REF = { $ref: "#/components/schemas/Base" };
const VALUES_HELPER = "type PropertyValues<T> = T extends unknown ? T[keyof T] : never;";
const BASE_VALUES = 'PropertyValues<components["schemas"]["Base"]>';

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas: { Base: BASE, ...schemas } },
  } as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

async function fixed(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}) {
  return generate(documentWith(schemas), { fix: ["unevaluated-properties"], ...options });
}

/** The type errors of `code` after the output, one line each. */
async function errorsWith(schemas: Record<string, unknown>, code: string): Promise<string[]> {
  return typeErrorsOf(`${await fixed(schemas)}\ntype S = components["schemas"];\n${code}`);
}

describe("unevaluated-properties fix", () => {
  it("openapiTS without the fix ignores unevaluatedProperties", async () => {
    const output = await generate(documentWith({ Tags: { type: "object", unevaluatedProperties: STRING } }));

    expect(output).toContain("Tags: Record<string, never>;");
  });

  it("openapiTS with the fix types the keys of an object without properties", async () => {
    const output = await fixed({ Tags: { type: "object", unevaluatedProperties: STRING } });

    expect(output).toContain("Tags: {\n            [key: string]: string;\n        };");
  });

  it("openapiTS with the fix adds the declared property types to the index signature", async () => {
    const output = await fixed({
      Item: { type: "object", properties: { size: { type: "number" } }, unevaluatedProperties: STRING },
    });

    expect(output).toContain("[key: string]: string | number | undefined;");
  });

  it("openapiTS with the fix reads the values of a referenced allOf member", async () => {
    const output = await fixed({ Item: { allOf: [BASE_REF], unevaluatedProperties: STRING } });

    expect(output).toContain(
      `Item: components["schemas"]["Base"] & {\n            [key: string]: string | ${BASE_VALUES};`,
    );
    expect(output).toContain(VALUES_HELPER);
  });

  it("openapiTS with the fix adds the helper once", async () => {
    const output = await fixed({
      First: { allOf: [BASE_REF], unevaluatedProperties: STRING },
      Second: { allOf: [BASE_REF], unevaluatedProperties: { type: "boolean" } },
    });

    expect(output.split(VALUES_HELPER)).toHaveLength(2);
  });

  it("openapiTS with the fix reads inline anyOf and oneOf variants", async () => {
    const output = await fixed({
      Item: {
        type: "object",
        oneOf: [{ properties: { a: { type: "boolean" } } }, { properties: { b: { type: "number" } } }],
        unevaluatedProperties: STRING,
      },
    });

    expect(output).toContain("[key: string]: string | boolean | undefined | number;");
  });

  it("openapiTS with the fix types the keys as unknown for true and {}", async () => {
    const output = await fixed({
      Open: { type: "object", properties: ID, unevaluatedProperties: true },
      Empty: { type: "object", properties: ID, unevaluatedProperties: {} },
    });

    expect(output.split("[key: string]: unknown;")).toHaveLength(3);
  });

  it("openapiTS with the fix adds nothing for false", async () => {
    const output = await fixed({ Closed: { type: "object", properties: ID, unevaluatedProperties: false } });

    expect(output).toContain("Closed: {\n            id?: number;\n        };");
  });

  it("openapiTS with the fix leaves unevaluatedProperties next to additionalProperties alone", async () => {
    const schema = { type: "object", additionalProperties: { type: "boolean" }, unevaluatedProperties: STRING };

    const output = await fixed({ Flags: schema });

    expect(output).toContain("Flags: {\n            [key: string]: boolean;\n        };");
  });

  it("openapiTS with the fix leaves a schema that is not an object alone", async () => {
    const output = await fixed({ Name: { type: "string", unevaluatedProperties: STRING } });

    expect(output).toContain("Name: string;");
  });

  it("openapiTS with the fix types the object of a type list and keeps null outside", async () => {
    const output = await fixed({
      Maybe: { type: ["object", "null"], properties: ID, unevaluatedProperties: STRING },
    });

    expect(output).toContain(
      "Maybe: ({\n            id?: number;\n        } & {\n            [key: string]: string | number | undefined;\n        }) | null;",
    );
  });

  it("openapiTS with the fix and immutable writes a readonly index signature", async () => {
    const output = await fixed({ Tags: { type: "object", unevaluatedProperties: STRING } }, { immutable: true });

    expect(output).toContain("readonly [key: string]: string;");
  });

  it("openapiTS with the fix keeps null of a nullable schema outside the intersection", async () => {
    const output = await generate(
      {
        openapi: "3.0.3",
        info: { title: "t", version: "1" },
        paths: {},
        components: { schemas: { Tags: { type: "object", nullable: true, unevaluatedProperties: STRING } } },
      } as OpenAPI3,
      { fix: ["unevaluated-properties"] },
    );

    expect(output).toContain("Tags: {\n            [key: string]: string;\n        } | null;");
  });

  it("openapiTS with the fix adds the patternProperties types too", async () => {
    const output = await fixed({
      Meta: {
        type: "object",
        patternProperties: { "^x-": { type: "number" } },
        unevaluatedProperties: STRING,
      },
    });

    expect(output).toContain("} & {\n            [key: string]: string | number;\n        };");
  });

  it("openapiTS with the fix and enumValues indexes an enum value type with string", async () => {
    const tags = { type: "object", unevaluatedProperties: { type: "string", enum: ["a", "b"] } };

    const output = await fixed({ Tags: tags }, { enumValues: true });

    expect(output).toContain('FlattenedDeepRequired<components>["schemas"]["Tags"][string]>');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with the fix and enumValues types a widened value's array by its values", async () => {
    const value = { type: "string", enum: ["a", "b"] };
    const own = { type: "object", properties: ID, unevaluatedProperties: value };
    const composed = { allOf: [BASE_REF], unevaluatedProperties: value };

    const output = await fixed({ Own: own, Composed: composed }, { enumValues: true });

    expect(output).toContain('export const ownValues: ReadonlyArray<"a" | "b"> = ["a", "b"];');
    expect(output).toContain('export const composedValues: ReadonlyArray<"a" | "b"> = ["a", "b"];');
    expect(typeErrorsOf(`${output}\nconst bad: (typeof ownValues)[number] = 5;`)).not.toEqual([]);
  });

  it("openapiTS with the fix types the inline copy of a $ref to a widened value by its values", async () => {
    const value = { type: "string", enum: ["a", "b"] };
    const composed = { allOf: [BASE_REF], unevaluatedProperties: value };
    const use = { type: "object", properties: { v: { $ref: "#/components/schemas/Composed/unevaluatedProperties" } } };

    const output = await generate(documentWith({ Use: use, Composed: composed }), {
      enumValues: true,
      fix: ["unevaluated-properties", "ref-pointers"],
    });

    expect(output).toContain('export const composedValues: ReadonlyArray<"a" | "b"> = ["a", "b"];');
    expect(output).not.toContain('["Composed"][string]>');
  });

  it("openapiTS with the fix and root types renames a schema alias that the helper takes", async () => {
    const output = await fixed(
      { PropertyValues: { allOf: [BASE_REF], unevaluatedProperties: STRING } },
      { rootTypes: true, rootTypesNoSchemaPrefix: true },
    );

    expect(output).toContain("export type PropertyValues_2 = components['schemas']['PropertyValues'];");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with the fix accepts valid values and rejects others", async () => {
    const schemas = {
      Item: { allOf: [BASE_REF], properties: { size: { type: "number" } }, unevaluatedProperties: STRING },
      Pick: {
        type: "object",
        oneOf: [BASE_REF, { properties: { code: { type: "boolean" } } }],
        unevaluatedProperties: STRING,
      },
    };
    const code = [
      'const item: S["Item"] = { id: 1, size: 2, note: "a" };',
      'const pick: S["Pick"] = { code: true, note: "a" };',
      'const note: string | number | undefined = ({} as S["Item"])["note"];',
      "// @ts-expect-error a key no keyword declares must be a string",
      'const wrong: S["Item"] = { id: 1, note: true };',
    ].join("\n");

    expect(await errorsWith(schemas, code)).toEqual([]);
  });
});
