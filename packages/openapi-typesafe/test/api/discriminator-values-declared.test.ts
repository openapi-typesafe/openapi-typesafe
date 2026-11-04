import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `discriminator-values` fix: no second value where a member declares it (ADR-024, #2124). */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ADDED = "discriminator enum property added by openapi-typesafe";

function declared(type: Record<string, unknown>, required: readonly string[] = ["type"]) {
  return { type: "object", required, properties: { type } };
}

function image(member: Record<string, unknown>, mapping: Record<string, string> = { agent: "ImageTypeAgent" }) {
  const mapped = Object.fromEntries(Object.entries(mapping).map(([value, name]) => [value, ref(name).$ref]));
  return {
    Image: { oneOf: [ref("ImageTypeAgent")], discriminator: { propertyName: "type", mapping: mapped } },
    ImageTypeAgent: member,
    ImageBase: { required: ["url"], properties: { url: { type: "string" } } },
  };
}

/** Upstream #2124: the member declares `type: "agent"`, the value its mapping gives it. */
const SCHEMAS = image({ allOf: [ref("ImageBase"), declared({ type: "string", enum: ["agent"] })] });

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.0.0", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(documentWith(structuredClone(schemas)), { silent: true, ...options }));
}

async function fixed(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return generate(schemas, { fix: ["discriminator-values"], ...options });
}

function countOf(output: string, text: string): number {
  return output.split(text).length - 1;
}

describe("discriminator-values fix, declared value", () => {
  it("openapiTS without the fix adds the declared value a second time", async () => {
    const output = await generate(SCHEMAS);

    expect(countOf(output, 'type: "agent";')).toBe(2);
    expect(output).toContain(ADDED);
  });

  it("openapiTS with the fix keeps the member's own declaration only", async () => {
    const output = await fixed(SCHEMAS);

    expect(output).toContain(`ImageTypeAgent: components["schemas"]["ImageBase"] & {
            /** @enum {string} */
            type: "agent";
        };`);
    expect(output).not.toContain(ADDED);
  });

  it("openapiTS with the fix accepts a const and values in another order", async () => {
    const constant = image({ allOf: [declared({ type: "string", const: "agent" })] });
    const both = image(
      { allOf: [declared({ type: "string", enum: ["robot", "agent"] })] },
      { agent: "ImageTypeAgent", robot: "ImageTypeAgent" },
    );

    expect(await fixed(constant)).not.toContain(ADDED);
    expect(await fixed(both)).not.toContain(ADDED);
  });

  it("openapiTS with the fix keeps the description of an object schema's own property", async () => {
    const own = image(declared({ type: "string", enum: ["agent"], description: "Kind of image" }));

    const output = await fixed(own);

    expect(output).toContain("@description Kind of image\n");
    expect(output).not.toContain("replaced by openapi-typesafe");
  });

  it("openapiTS with the fix still adds the value where the member declares another or none", async () => {
    const other = image({ allOf: [declared({ type: "string", enum: ["robot"] })] });
    const optional = image({ allOf: [declared({ type: "string", enum: ["agent"] }, [])] });
    const referenced = image({ allOf: [declared(ref("ImageBase"))] });

    expect(await fixed(other)).toBe(await generate(other));
    expect(await fixed(optional)).toBe(await generate(optional));
    expect(await fixed(referenced)).toBe(await generate(referenced));
  });

  it("openapiTS with the fix adds the value once when a mapping and allOf both give it", async () => {
    const schemas = {
      Animal: {
        type: "object",
        properties: { type: { type: "string" } },
        discriminator: { propertyName: "type", mapping: { CAT: ref("Cat").$ref } },
        oneOf: [ref("Cat")],
      },
      Cat: { allOf: [ref("Animal"), { properties: { age: { type: "integer" } } }] },
    };

    expect(countOf(await generate(schemas), 'type: "CAT";')).toBe(2);
    expect(countOf(await fixed(schemas), 'type: "CAT";')).toBe(1);
  });

  it("openapiTS with the fix counts a declared value as mapped", async () => {
    const shelter = {
      properties: { resident: { oneOf: [ref("ImageTypeAgent")], discriminator: { propertyName: "type" } } },
    };
    const schemas = { ...SCHEMAS, Shelter: shelter };

    const output = await fixed(schemas);

    expect(output).not.toContain(ADDED);
    expect(countOf(output, 'type: "agent";')).toBe(1);
  });

  it("openapiTS with the fix gives types that values have and that narrow", async () => {
    const code = `${await fixed(SCHEMAS)}
const agent: components["schemas"]["Image"] = { type: "agent", url: "u" };
// @ts-expect-error another value
const robot: components["schemas"]["Image"] = { type: "robot", url: "u" };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });
});
