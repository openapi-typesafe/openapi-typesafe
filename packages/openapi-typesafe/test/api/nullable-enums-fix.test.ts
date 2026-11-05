import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `nullable-enums` fix (ADR-021, upstream #1872). */

const VALUES_31 = { type: ["string", "null"], enum: ["VALUE1", "VALUE2", null] };

function documentWith(values: unknown, openapi = "3.1.0"): OpenAPI3 {
  return {
    openapi,
    info: { title: "t", version: "1" },
    paths: {},
    components: {
      schemas: {
        Values: values,
        Holder: { type: "object", properties: { values: { $ref: "#/components/schemas/Values" } } },
      },
    },
  } as unknown as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, enum: true, ...options }));
}

async function fixed(values: unknown, options: OpenAPITSOptions = {}, openapi?: string) {
  return generate(documentWith(values, openapi), { fix: ["nullable-enums"], ...options });
}

const ENUM = 'export enum Values {\n    VALUE1 = "VALUE1",\n    VALUE2 = "VALUE2"\n}';

describe("nullable-enums fix", () => {
  it("openapiTS without the fix keeps a nullable enum a union and declares no enum", async () => {
    const output = await generate(documentWith(VALUES_31));

    expect(output).toContain('Values: "VALUE1" | "VALUE2" | null;');
    expect(output).not.toContain("export enum");
  });

  it("openapiTS with the fix declares the enum without null and types the schema E | null", async () => {
    const output = await fixed(VALUES_31);

    expect(output).toContain(ENUM);
    expect(output).toContain("Values: Values | null;");
  });

  it("openapiTS with the fix reads OpenAPI 3.0 nullable with null in the enum", async () => {
    const values = { type: "string", nullable: true, enum: ["VALUE1", "VALUE2", null] };

    const output = await fixed(values, {}, "3.0.3");

    expect(output).toContain(ENUM);
    expect(output).toContain("Values: Values | null;");
  });

  it("openapiTS with the fix leaves null out where the type does not admit it", async () => {
    const output = await fixed({ type: "string", enum: ["VALUE1", "VALUE2", null] });

    expect(output).toContain(ENUM);
    expect(output).toContain("Values: Values;");
  });

  it("openapiTS with the fix keeps the metadata of each value at its position", async () => {
    const values = { ...VALUES_31, enum: [null, "VALUE1", "VALUE2"], "x-enum-varnames": ["None", "One", "Two"] };

    const output = await fixed(values);

    expect(output).toContain('One = "VALUE1",\n    Two = "VALUE2"');
  });

  it("openapiTS with the fix keeps an enum of only null a union", async () => {
    expect(await fixed({ type: "null", enum: [null] })).toContain("Values: null;");
  });

  it("openapiTS with the fix changes nothing without --enum", async () => {
    const output = await fixed(VALUES_31, { enum: false });

    expect(output).toContain('Values: "VALUE1" | "VALUE2" | null;');
  });

  it("openapiTS output with the fix compiles and accepts a member or null", async () => {
    const code = `${await fixed(VALUES_31)}
const some: components["schemas"]["Holder"] = { values: Values.VALUE1 };
const none: components["schemas"]["Holder"] = { values: null };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });
});
