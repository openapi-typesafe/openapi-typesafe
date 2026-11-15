import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * Schema `$ref`s through shapes the shape model of ADR-026 does not read: the type a pass writes
 * is checked against the generated types, and one that surely does not compile is typed in place
 * in the next pass. A type that compiles stays as it was.
 */

const ref = (pointer: string) => ({ $ref: `#/components/schemas/${pointer}` });
const STRING = { type: "string" };

function documentOf(schemas: Record<string, unknown>): OpenAPI3 {
  const info = { title: "t", version: "1" };
  return { openapi: "3.1.0", info, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}) {
  return astToString(await openapiTS(documentOf(schemas), { silent: true, ...options }));
}

function aliasOf(output: string, name: string): string | undefined {
  return new RegExp(`^ {8}${name}: (.*);$`, "m").exec(output)?.[1];
}

/** An object with a `oneOf` of a string list type: the generated type is `string | { … }`. */
const STRING_OR_OBJECT = {
  type: ["object"],
  properties: { email: STRING },
  oneOf: [{ type: ["string"] }],
};

describe("schema $refs whose written type the generated types do not have", () => {
  it("openapiTS types a $ref into a variant of a null oneOf in place", async () => {
    const output = await generate({ Contact: { oneOf: [{ type: "null" }] }, R: ref("Contact/oneOf/0") });

    expect(aliasOf(output, "R")).toBe("null");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it.each([[[]], [["ref-pointers"]], [["all"]]] as const)(
    "openapiTS with fix %j types a property of a union with a string in place",
    async (fix) => {
      const schemas = { Contact: STRING_OR_OBJECT, R: ref("Contact/properties/email") };

      const output = await generate(schemas, { fix: [...fix] });

      expect(aliasOf(output, "R")).toBe("string");
      expect(typeErrorsOf(output)).toEqual([]);
    },
  );

  it("openapiTS keeps a pointer the generated types have", async () => {
    const contact = { type: "object", properties: { email: STRING }, oneOf: [{ type: "object" }] };

    const output = await generate({ Contact: contact, R: ref("Contact/properties/email") });

    expect(aliasOf(output, "R")).toBe('components["schemas"]["Contact"]["email"]');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS checks a $ref that only an allOf item holds", async () => {
    const schemas = { Contact: STRING_OR_OBJECT, H: { allOf: [ref("Contact/properties/email")] } };

    const output = await generate(schemas);

    expect(aliasOf(output, "H")).toBe("string");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types a deeper $ref through the same union in place", async () => {
    const schemas = {
      Contact: { ...STRING_OR_OBJECT, properties: { email: { type: "object", properties: { at: STRING } } } },
      R: ref("Contact/properties/email/properties/at"),
    };

    const output = await generate(schemas);

    expect(aliasOf(output, "R")).toBe("string");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("$ref pointer checks into templated paths", () => {
  it("openapiTS with --path-params-as-types reads a $ref into a templated path as written", async () => {
    const response = { content: { "application/json": { schema: { type: "object", properties: { name: STRING } } } } };
    const operation = {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
      responses: { 200: { description: "ok", ...response } },
    };
    const document = {
      ...documentOf({
        R: { $ref: "#/paths/~1pets~1{id}/get/responses/200/content/application~1json/schema/properties/name" },
      }),
      paths: { "/pets/{id}": { get: operation } },
    } as OpenAPI3;

    const output = astToString(await openapiTS(document, { silent: true, pathParamsAsTypes: true }));

    expect(aliasOf(output, "R")).toContain("paths[");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("the first pass of the $ref pointer checks", () => {
  async function transformCalls(schemas: Record<string, unknown>): Promise<number> {
    let calls = 0;
    const transform = () => {
      calls++;
      return undefined;
    };
    await openapiTS(documentOf(schemas), { silent: true, transform });
    return calls;
  }

  it("openapiTS runs no first pass for a document without $refs into schemas", async () => {
    const alone = await transformCalls({ Contact: STRING_OR_OBJECT });

    const withRef = await transformCalls({ Contact: STRING_OR_OBJECT, R: ref("Contact") });

    expect(withRef).toBe(alone + 1);
  });

  it("openapiTS runs a first pass for a document with a $ref into a schema", async () => {
    const plain = await transformCalls({ Contact: STRING_OR_OBJECT, R: ref("Contact") });

    const pointed = await transformCalls({ Contact: STRING_OR_OBJECT, R: ref("Contact/properties/email") });

    expect(pointed).toBeGreaterThan(plain + 1);
  });
});
