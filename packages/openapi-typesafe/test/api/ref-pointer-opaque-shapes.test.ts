import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * Schema `$ref`s through the shapes the pointer walk of ADR-026 leaves opaque, and through the
 * shapes it reads although they are nested or nullable: by default each output compiles, with the
 * original pointer kept where it compiles and the target's type where it does not.
 */

const ref = (pointer: string) => ({ $ref: `#/components/schemas/${pointer}` });
const holder = (pointer: string) => ({ type: "object", properties: { r: ref(pointer) } });
const STRING = { type: "string" };
const objectOf = (properties: Record<string, unknown>) => ({ type: "object", properties });

function documentOf(schemas: Record<string, unknown>, openapi = "3.1.0"): OpenAPI3 {
  return { openapi, info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function holderType(document: OpenAPI3, options: OpenAPITSOptions = {}) {
  const output = astToString(await openapiTS(document, { silent: true, ...options }));
  return { output, type: /\br\?: (.*);/.exec(output)?.[1] };
}

function nested(depth: number): unknown {
  return depth === 0 ? objectOf({ leaf: STRING }) : { allOf: [nested(depth - 1)] };
}

describe("schema $refs through opaque shapes keep a pointer that compiles", () => {
  it.each([
    [
      "a $ref back to its own schema",
      { Ring: objectOf({ next: ref("Ring"), name: STRING }), H: holder("Ring/properties/next/properties/name") },
      'NonNullable<components["schemas"]["Ring"]["next"]>["name"]',
    ],
    [
      "the discriminator's own property",
      {
        Pet: {
          ...objectOf({ kind: STRING }),
          required: ["kind"],
          discriminator: { propertyName: "kind", mapping: { cat: "#/components/schemas/Cat" } },
        },
        Cat: { allOf: [ref("Pet"), objectOf({ lives: { type: "integer" } })] },
        H: holder("Pet/properties/kind"),
      },
      'components["schemas"]["Pet"]["kind"]',
    ],
    [
      "a built-in member of a literal",
      { Color: { type: "string", enum: ["red"], length: { type: "boolean" } }, H: holder("Color/length") },
      'components["schemas"]["Color"]["length"]',
    ],
    [
      "a key of an object literal",
      { Const: { const: { a: 1 }, a: STRING }, H: holder("Const/a") },
      'components["schemas"]["Const"]["a"]',
    ],
    [
      "properties of one name in several parts",
      {
        X: {
          ...objectOf({ a: STRING }),
          required: ["a"],
          allOf: [{ ...objectOf({ a: { type: "string", minLength: 1 } }), required: ["a"] }],
        },
        H: holder("X/properties/a"),
      },
      'components["schemas"]["X"]["a"]',
    ],
  ])("openapiTS through %s", async (_name, schemas, expected) => {
    const { output, type } = await holderType(documentOf(schemas));

    expect(type).toBe(expected);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with --binary-as-blob keeps a pointer into a binary schema", async () => {
    const schemas = { File: { type: "string", format: "binary", size: { type: "boolean" } }, H: holder("File/size") };

    const { output, type } = await holderType(documentOf(schemas), { binaryAsBlob: true });

    expect(type).toBe('components["schemas"]["File"]["size"]');
    // The DOM library declares `Blob`; the checker of the tests loads no library of it.
    expect(typeErrorsOf(`declare class Blob { readonly size: number; }\n${output}`)).toEqual([]);
  });

  it("openapiTS types the discriminator's own property next to its oneOf in place", async () => {
    // The discriminator scan gives `Cat` its own `kind`, so `Pet["kind"]` reads `"Cat"`.
    const schemas = {
      Pet: {
        ...objectOf({ kind: STRING }),
        required: ["kind"],
        discriminator: { propertyName: "kind" },
        oneOf: [ref("Cat")],
      },
      Cat: objectOf({ kind: STRING }),
      H: holder("Pet/properties/kind"),
    };

    const { output, type } = await holderType(documentOf(schemas));

    expect(type).toBe("string");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types a $ref into a tuple position in place", async () => {
    const schemas = {
      T: { type: "array", prefixItems: [objectOf({ a: STRING })] },
      H: holder("T/prefixItems/0/properties/a"),
    };

    const { output, type } = await holderType(documentOf(schemas));

    expect(type).toBe("string");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("schema $refs through nested and nullable shapes get the target's type", () => {
  it("openapiTS types a $ref through ten nested allOf items in place", async () => {
    const schemas = { Deep: nested(10), H: holder(`Deep/${"allOf/0/".repeat(10)}properties/leaf`) };

    const { output, type } = await holderType(documentOf(schemas));

    expect(type).toBe("string");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it.each([
    ["3.0.3", "nullable allOf", { nullable: true, allOf: [objectOf({ x: STRING })] }, "allOf/0/properties/x"],
    ["3.1.0", "nullable allOf", { nullable: true, allOf: [objectOf({ x: STRING })] }, "allOf/0/properties/x"],
    ["3.0.3", "nullable anyOf", { nullable: true, anyOf: [STRING, { type: "integer" }], x: STRING }, "x"],
    ["3.0.3", "nullable schema without a type", { nullable: true, x: STRING }, "x"],
    ["3.1.0", "type list with null", { type: ["string", "null"], x: STRING }, "x"],
  ])("openapiTS %s: types a $ref through a %s in place", async (openapi, _name, node, pointer) => {
    const { output, type } = await holderType(documentOf({ N: node, H: holder(`N/${pointer}`) }, openapi));

    expect(type).toBe("string");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
