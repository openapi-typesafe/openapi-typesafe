import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum-values` arrays of tuple elements and union members: `FlattenedDeepRequired` reads a
 * tuple or a union as all of its members, so the location admits the values of the siblings too,
 * and the array is typed by its own values (ADR-027).
 */

const SCHEMAS = {
  Pair: {
    type: "array",
    prefixItems: [
      { type: "string", enum: ["asc", "desc"] },
      { type: "string", enum: ["name", "date"] },
    ],
  },
  Open: { type: "array", prefixItems: [{ type: "string", enum: ["t1", "t2"] }] },
  Run: {
    type: "object",
    properties: { status: { type: "string", enum: ["queued", "done"] } },
    oneOf: [
      { properties: { status: { type: "string", enum: ["done"] } }, required: ["status"] },
      { properties: { status: { type: "string", enum: ["queued"] } } },
    ],
  },
  Rule: { type: "object", properties: { params: { type: "object" } } },
  TagRule: {
    allOf: [
      { $ref: "#/components/schemas/Rule" },
      {
        properties: {
          params: {
            oneOf: [
              { properties: { op: { type: "string", enum: ["add"] } }, required: ["op"] },
              { properties: { op: { type: "string", enum: ["set"] } }, required: ["op"] },
            ],
          },
        },
      },
    ],
  },
  Mixed: {
    anyOf: [
      { type: "string", enum: ["a", "b"] },
      { type: "integer", enum: [1, 2] },
    ],
  },
};

async function generate(options: OpenAPITSOptions = {}): Promise<string> {
  const document = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas: SCHEMAS },
  } as unknown as OpenAPI3;
  return astToString(await openapiTS(document, { silent: true, enumValues: true, ...options }));
}

const item = (name: string, value: string) => `const x: (typeof ${name})[number] = ${value};`;

describe("--enum-values arrays of tuple elements", () => {
  it("openapiTS types each element's array by its own values", async () => {
    const output = await generate();

    expect(output).toContain('export const pairValues: ReadonlyArray<"asc" | "desc"> = ');
    expect(output).toContain('export const pairValues_2: ReadonlyArray<"name" | "date"> = ');
    expect(typeErrorsOf(`${output}\n${item("pairValues", '"date"')}`)).not.toEqual([]);
  });

  it("openapiTS keeps the location of a tuple whose one element has the values", async () => {
    const output = await generate();

    expect(output).toContain('openValues: ReadonlyArray<FlattenedDeepRequired<components>["schemas"]["Open"]> = ');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with prefix-items types the array of an open tuple by its values", async () => {
    const output = await generate({ fix: ["prefix-items"] });

    expect(output).toContain('export const openValues: ReadonlyArray<"t1" | "t2"> = ');
    expect(typeErrorsOf(`${output}\n${item("openValues", "5")}`)).not.toEqual([]);
  });
});

describe("--enum-values arrays of union members", () => {
  it("openapiTS types each member's array by its own values", async () => {
    const output = await generate();

    expect(output).toContain('export const mixedAnyOf0Values: ReadonlyArray<"a" | "b"> = ');
    expect(output).toContain("export const mixedAnyOf1Values: ReadonlyArray<1 | 2> = ");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types each member's array by its values where members narrow a property", async () => {
    const output = await generate();

    expect(output).toContain('export const runOneOf0StatusValues: ReadonlyArray<"done"> = ');
    expect(output).toContain('export const runOneOf1StatusValues: ReadonlyArray<"queued"> = ');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types each member's array by its values next to a property of no keys", async () => {
    const output = await generate();

    expect(output).toContain('export const tagRuleParamsOneOf0OpValues: ReadonlyArray<"add"> = ');
    expect(output).toContain('export const tagRuleParamsOneOf1OpValues: ReadonlyArray<"set"> = ');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
