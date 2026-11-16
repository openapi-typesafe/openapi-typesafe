import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * Schema `$ref`s whose original index reads a type that is not the target's (ADR-026): a union
 * of records, the rest items of a tuple, and the `$defs` of an empty enum. Each gets the type it
 * points at, by default and with `ref-pointers`.
 */

const STRINGS = { type: "object", additionalProperties: { type: "string" } };
const ref = (pointer: string) => ({ $ref: `#/components/schemas/${pointer}` });
const SCHEMAS = {
  Records: { oneOf: [STRINGS, STRINGS] },
  Mixed: { oneOf: [STRINGS, ref("Numbers")] },
  Numbers: { type: "object", additionalProperties: { type: "integer" } },
  Tuple: {
    type: "array",
    prefixItems: [{ type: "string" }],
    items: { type: "object", properties: { s: { type: "boolean" } } },
  },
  Empty: { type: "string", enum: [], $defs: { X: { type: "integer" } } },
  RecordValue: ref("Records/oneOf/1/additionalProperties"),
  MixedValue: ref("Mixed/oneOf/1/additionalProperties"),
  NumbersValue: ref("Numbers/additionalProperties"),
  RestItem: ref("Tuple/items"),
  RestProperty: ref("Tuple/items/properties/s"),
  EmptyDefinition: ref("Empty/$defs/X"),
};

function documentOf(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(documentOf(SCHEMAS), { silent: true, ...options }));
}

describe("schema $refs read through unions, tuples and empty enums", () => {
  it.each([
    ["the defaults", {}],
    ["ref-pointers", { fix: ["ref-pointers"] }],
    ["--enum", { enum: true }],
  ] as [string, OpenAPITSOptions][])("openapiTS with %s types each target in place", async (_name, options) => {
    const output = await generate(options);

    expect(output).toContain("RecordValue: string;");
    expect(output).toContain("MixedValue: number;");
    expect(output).toContain("RestItem: {\n            s?: boolean;\n        };");
    expect(output).toContain("RestProperty: boolean;");
    expect(output).toContain("EmptyDefinition: number;");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps a record value read through one object's index signature", async () => {
    const output = await generate();

    expect(output).toContain('NumbersValue: components["schemas"]["Numbers"]["additionalProperties"];');
  });

  it("openapiTS still reads the items of an array without prefixItems by number", async () => {
    const schemas = { List: { type: "array", items: STRINGS }, Item: ref("List/items/additionalProperties") };

    const output = astToString(await openapiTS(documentOf(schemas), { silent: true, fix: ["ref-pointers"] }));

    expect(output).toContain('Item: components["schemas"]["List"][number][string];');
  });

  it("openapiTS types a $ref through the $defs of an enum of only null in place", async () => {
    const schemas = { OnlyNull: { enum: [null], $defs: { X: { type: "integer" } } }, R: ref("OnlyNull/$defs/X") };

    const output = astToString(await openapiTS(documentOf(schemas), { silent: true }));

    expect(output).toContain("R: number;");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with --enum corrects a $ref into an empty enum's false keyword", async () => {
    const schemas = {
      Empty: { type: "string", enum: [], additionalProperties: false },
      R: ref("Empty/additionalProperties"),
    };

    const plain = astToString(await openapiTS(documentOf(schemas), { silent: true }));
    const output = astToString(await openapiTS(documentOf(schemas), { silent: true, enum: true }));

    expect(plain).toContain('R: components["schemas"]["Empty"]["additionalProperties"];');
    expect(output).toContain("R: never;");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
