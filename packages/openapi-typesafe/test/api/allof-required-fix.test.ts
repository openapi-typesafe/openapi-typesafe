import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `allof-required` fix (ADR-021, roadmap R6). */

const INFO = {
  type: "object",
  properties: { name: { type: "string" }, note: { type: "string" } },
};
const INFO_REF = { $ref: "#/components/schemas/Info" };

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas: { Info: INFO, ...schemas } },
  } as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

async function fixed(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return generate(documentWith(schemas), { fix: ["allof-required"], ...options });
}

describe("allof-required fix", () => {
  it("openapiTS without the fix keeps the empty object member", async () => {
    const document = documentWith({ Test: { allOf: [INFO_REF, { type: "object", required: ["name"] }] } });

    expect(await generate(document)).toContain('Test: components["schemas"]["Info"] & Record<string, never>;');
  });

  it("openapiTS with the fix makes a typed required-only member's keys required on a $ref", async () => {
    const output = await fixed({ Test: { allOf: [INFO_REF, { type: "object", required: ["name", "note"] }] } });

    expect(output).toContain('Test: WithRequired<components["schemas"]["Info"], "name" | "note">;');
  });

  it("openapiTS with the fix handles a bare required member and leaves out unknown keys", async () => {
    const output = await fixed({ Test: { allOf: [INFO_REF, { required: ["name", "missing"] }] } });

    expect(output).toContain('Test: WithRequired<components["schemas"]["Info"], "name">;');
  });

  it("openapiTS with the fix makes the keys of an inline member required", async () => {
    const inline = { type: "object", properties: { a: { type: "string" } } };

    const output = await fixed({ Test: { allOf: [inline, { required: ["a"] }] } });

    expect(output).toContain("Test: {\n            a: string;\n        };");
  });

  it("openapiTS with the fix follows a $ref to a required-only schema (#2165)", async () => {
    const output = await fixed({
      Required: { type: "object", required: ["name"] },
      Test: { allOf: [INFO_REF, { $ref: "#/components/schemas/Required" }] },
    });

    expect(output).toContain('Test: WithRequired<components["schemas"]["Info"], "name">;');
    expect(output).toContain("Required: Record<string, never>;");
  });

  it("openapiTS with the fix leaves out an empty object member (#1520)", async () => {
    const output = await fixed({
      Empty: { type: "object" },
      Test: { allOf: [{ $ref: "#/components/schemas/Empty" }, INFO_REF] },
    });

    expect(output).toContain('Test: components["schemas"]["Info"];');
  });

  it("openapiTS with the fix leaves out annotation-only members, also deprecated ones", async () => {
    const output = await fixed({
      Test: { allOf: [INFO_REF, { description: "Old." }, { deprecated: true, example: {} }] },
    });

    expect(output).toContain('Test: components["schemas"]["Info"];');
  });

  it("openapiTS with the fix merges the parent's required with the members' once", async () => {
    const output = await fixed({ Test: { required: ["name"], allOf: [INFO_REF, { required: ["name"] }] } });

    expect(output).toContain('Test: WithRequired<components["schemas"]["Info"], "name">;');
  });

  it("openapiTS with the fix keeps members that change the shape", async () => {
    const output = await fixed({
      Nullable: { allOf: [INFO_REF, { type: "object", nullable: true, required: ["name"] }] },
      Typed: { allOf: [INFO_REF, { type: ["object", "null"], required: ["name"] }] },
      Sized: { allOf: [INFO_REF, { required: ["name"], minProperties: 1 }] },
      Required: { type: "object", required: ["name"] },
      RefWithSibling: { allOf: [INFO_REF, { $ref: "#/components/schemas/Required", description: "d" }] },
    });

    expect(output).not.toContain("WithRequired<");
  });

  it("openapiTS with the fix and only required-only members keeps them", async () => {
    const output = await fixed({ Test: { allOf: [{ type: "object", required: ["x"] }] } });

    expect(output).toContain("Test: Record<string, never>;");
  });

  it("openapiTS with the fix keeps a mapped $ref member: the discriminator scan typed it", async () => {
    const output = await fixed({
      Pet: {
        oneOf: [{ $ref: "#/components/schemas/Cat" }],
        discriminator: { propertyName: "kind", mapping: { cat: "#/components/schemas/Cat" } },
      },
      Cat: { type: "object", required: ["kind"] },
      Test: { allOf: [INFO_REF, { $ref: "#/components/schemas/Cat" }] },
    });

    expect(output).toContain('Test: components["schemas"]["Info"] & components["schemas"]["Cat"];');
  });

  it("openapiTS with all is the same as listing every fix", async () => {
    const schemas = { Test: { allOf: [INFO_REF, { required: ["name"] }] } };

    expect(await generate(documentWith(schemas), { fix: ["all"] })).toBe(await fixed(schemas));
  });

  it("openapiTS with the fix and immutable keeps WithRequired", async () => {
    const output = await fixed({ Test: { allOf: [INFO_REF, { required: ["name"] }] } }, { immutable: true });

    expect(output).toContain('readonly Test: WithRequired<components["schemas"]["Info"], "name">;');
  });

  it("openapiTS with the fix writes output that compiles under strict settings", async () => {
    const output = await fixed({
      Required: { type: "object", required: ["note"] },
      A: { allOf: [INFO_REF, { required: ["name"] }] },
      B: { allOf: [INFO_REF, { $ref: "#/components/schemas/Required" }] },
    });

    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with an unknown fix fails with OPTION_FIX_UNKNOWN", async () => {
    const options = { fix: ["bogus"] } as unknown as OpenAPITSOptions;

    await expect(generate(documentWith({}), options)).rejects.toMatchObject({ code: "OPTION_FIX_UNKNOWN" });
  });
});
