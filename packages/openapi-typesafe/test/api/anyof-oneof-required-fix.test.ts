import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `anyof-oneof-required` fix : variants with only `required` over `properties`. */

const PROPERTIES = { cname: { type: "string" }, source: { type: "string" } };

function documentWith(pages: Record<string, unknown>): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas: { Pages: { type: "object", properties: PROPERTIES, ...pages } } },
  } as unknown as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

const FIX: OpenAPITSOptions = { fix: ["anyof-oneof-required"] };
const VARIANTS = [{ required: ["cname"] }, { required: ["source"], description: "From a branch" }];

describe("anyof-oneof-required fix", () => {
  it("openapiTS without the fix adds unknown variants, as the original", async () => {
    expect(await generate(documentWith({ anyOf: VARIANTS }))).toContain("} | unknown | unknown;");
  });

  it("openapiTS with the fix requires each anyOf variant's keys of the parent", async () => {
    const output = await generate(documentWith({ anyOf: VARIANTS }), FIX);

    expect(output).toContain('}, "cname"> | WithRequired<{');
    expect(output).toContain('}, "source">;');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with the fix requires each oneOf variant's keys of the parent", async () => {
    const output = await generate(documentWith({ oneOf: VARIANTS }), FIX);

    expect(output).toContain('}, "cname"> | WithRequired<{');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with the fix keeps variants with other keywords or unknown keys", async () => {
    const typed = await generate(documentWith({ anyOf: [{ required: ["cname"] }, { type: "object" }] }), FIX);
    const unknownKey = await generate(documentWith({ anyOf: [{ required: ["other"] }] }), FIX);
    const empty = await generate(documentWith({ anyOf: [{ required: [] }] }), FIX);
    const ref = await generate(documentWith({ anyOf: [{ $ref: "#/components/schemas/Pages" }] }), FIX);

    expect(typed).not.toContain("WithRequired");
    expect(unknownKey).not.toContain("WithRequired");
    expect(empty).not.toContain("WithRequired");
    expect(ref).not.toContain("WithRequired");
  });

  it("openapiTS with the fix needs a parent type", async () => {
    const document = {
      ...documentWith({}),
      components: { schemas: { Pages: { anyOf: VARIANTS } } },
    } as unknown as OpenAPI3;

    expect(await generate(document, FIX)).not.toContain("WithRequired");
  });
});
