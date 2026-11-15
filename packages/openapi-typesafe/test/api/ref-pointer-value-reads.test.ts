import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * Schema `$ref`s whose pointer type compiles but reads other values than the target (ADR-026):
 * a pointer that reads `never` where the target has values is typed in place, and with the
 * `ref-pointers` fix a pointer to an optional property leaves out the `undefined` it adds.
 */

const ref = (pointer: string) => ({ $ref: `#/components/schemas/${pointer}` });
const STRING = { type: "string" };

function documentOf(schemas: Record<string, unknown>): OpenAPI3 {
  const info = { title: "t", version: "1" };
  return { openapi: "3.1.0", info, paths: {}, components: { schemas } } as unknown as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}) {
  return astToString(await openapiTS(documentOf(schemas), { silent: true, ...options }));
}

function aliasOf(output: string, name: string): string | undefined {
  return new RegExp(`^ {8}${name}: (.*);$`, "m").exec(output)?.[1];
}

describe("schema $refs whose pointer type has no value", () => {
  it.each([
    ["an object that an allOf item makes null", { type: ["object"], allOf: [{ type: ["null"] }] }],
    [
      "an object and null of a type list that a part makes null",
      { type: ["null", "object"], allOf: [{ type: ["null"] }] },
    ],
  ])("openapiTS types a property of %s in place", async (_label, owner) => {
    const contact = { ...owner, properties: { email: STRING } };

    const output = await generate({ Contact: contact, R: ref("Contact/properties/email") });

    expect(aliasOf(output, "R")).toBe("string");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types an allOf item in place where the original reads never through closed parts", async () => {
    const contact = {
      type: "object",
      properties: { email: STRING },
      allOf: [{ type: "object", required: ["email"] }],
      oneOf: [{ type: "object" }, ref("Other")],
      unevaluatedProperties: false,
    };
    const schemas = { Other: { type: "object", properties: { x: STRING } }, Contact: contact };

    const output = await generate({ ...schemas, R: ref("Contact/allOf/0") });

    expect(aliasOf(output, "R")).toBe("Record<string, never>");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the pointer to a false schema of an owner without values", async () => {
    const contact = { type: ["object"], allOf: [{ type: ["null"] }], properties: { never: false } };

    const output = await generate({ Contact: contact, R: ref("Contact/properties/never") });

    expect(aliasOf(output, "R")).toBe('components["schemas"]["Contact"]["never"]');
  });
});
