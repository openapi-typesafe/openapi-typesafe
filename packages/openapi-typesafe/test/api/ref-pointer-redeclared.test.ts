import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * A schema `$ref` to a property that a composition part of its owner declares too (ADR-026). The
 * owner's type joins the parts, so the pointer reads the join, not the property: it is typed in
 * place where the other declaration may change the values, and keeps its pointer where it cannot.
 */

const ref = (pointer: string) => ({ $ref: `#/components/schemas/${pointer}` });
const enumOf = (...values: string[]) => ({ type: "string", enum: values });
const objectOf = (properties: Record<string, unknown>) => ({ type: "object", properties });
const POINTER = 'R: components["schemas"]["Kind"]["kind"];';

function documentOf(kind: object, variant: object): OpenAPI3 {
  const schemas = { Kind: kind, V: variant, R: ref("Kind/properties/kind") };
  const info = { title: "t", version: "1" };
  return { openapi: "3.1.0", info, paths: {}, components: { schemas } } as unknown as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}) {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

const withVariant = (keyword: string) => ({
  ...objectOf({ kind: enumOf("a", "c") }),
  [keyword]: [ref("V")],
});

describe("schema $refs to a property its owner's parts declare too", () => {
  it.each(["oneOf", "allOf", "anyOf"])(
    "openapiTS types the property in place next to a %s part of other values",
    async (keyword) => {
      const output = await generate(documentOf(withVariant(keyword), objectOf({ kind: enumOf("a") })));

      expect(output).toContain('R: "a" | "c";');
      expect(typeErrorsOf(output)).toEqual([]);
    },
  );

  it.each([
    ["a string of the same type", { type: "string" }],
    ["a string without a type", { description: "the kind", maxLength: 3 }],
    ["the same schema", enumOf("a", "c")],
  ])("openapiTS keeps the pointer next to %s", async (_label, other) => {
    const output = await generate(documentOf(withVariant("oneOf"), objectOf({ kind: other })));

    expect(output).toContain(POINTER);
  });

  it.each([
    ["a number", { type: "integer" }],
    ["an object", objectOf({ a: { type: "string" } })],
    ["a string with an enum", { type: "string", enum: ["a"] }],
    ["a string with a const", { type: "string", const: "a" }],
  ])("openapiTS types the property in place next to %s", async (_label, other) => {
    const output = await generate(documentOf(withVariant("oneOf"), objectOf({ kind: other })));

    expect(output).toContain('R: "a" | "c";');
  });

  it("openapiTS keeps the pointer where a part only has an index signature", async () => {
    const variant = { type: "object", additionalProperties: { type: "integer" } };

    const output = await generate(documentOf(withVariant("oneOf"), variant));

    expect(output).toContain(POINTER);
  });

  it("openapiTS keeps the pointer of a property its owner alone declares", async () => {
    const output = await generate(documentOf(withVariant("oneOf"), objectOf({ other: enumOf("x") })));

    expect(output).toContain(POINTER);
  });

  it("openapiTS keeps the pointer next to a variant reached by $ref of the same schema", async () => {
    const kind = { ...objectOf({ kind: ref("Shared") }), oneOf: [ref("V")] };
    const schemas = {
      Shared: enumOf("a", "c"),
      Kind: kind,
      V: objectOf({ kind: ref("Shared") }),
      R: ref("Kind/properties/kind"),
    };
    const info = { title: "t", version: "1" };
    const document = { openapi: "3.1.0", info, paths: {}, components: { schemas } } as unknown as OpenAPI3;

    const output = await generate(document);

    expect(output).toContain(POINTER);
  });

  it("openapiTS types the property in place next to a part's discriminator of its name", async () => {
    const variant = { ...objectOf({ kind: enumOf("a") }), discriminator: { propertyName: "kind" } };

    const output = await generate(documentOf(withVariant("oneOf"), variant));

    expect(output).toContain('R: "a" | "c";');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types an object property in place next to a part's empty object of it", async () => {
    const kind = { ...objectOf({ kind: objectOf({ a: { type: "string" } }) }), oneOf: [ref("V")] };

    const output = await generate(documentOf(kind, objectOf({ kind: { type: "object" } })));

    expect(output).toContain("R: {\n");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types the property in place next to a part it cannot read", async () => {
    const kind = { ...objectOf({ kind: enumOf("a", "c") }), oneOf: [ref("Alias")] };
    const schemas = {
      Kind: kind,
      Alias: ref("V"),
      V: objectOf({ kind: enumOf("a") }),
      R: ref("Kind/properties/kind"),
    };
    const info = { title: "t", version: "1" };
    const document = { openapi: "3.1.0", info, paths: {}, components: { schemas } } as unknown as OpenAPI3;

    const output = await generate(document);

    expect(output).toContain('R: "a" | "c";');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types a $ref into an allOf item in place where a part has a property of its name", async () => {
    const owner = { ...objectOf({ a: { type: "string" } }), allOf: [objectOf({ allOf: { type: "string" } })] };
    const schemas = { X: owner, R: ref("X/allOf/0") };
    const info = { title: "t", version: "1" };
    const document = { openapi: "3.1.0", info, paths: {}, components: { schemas } } as unknown as OpenAPI3;

    const output = await generate(document);

    // The original `X["allOf"]["0"]` read the part's string property `allOf`, not the item.
    expect(output).not.toContain('R: components["schemas"]["X"]["allOf"]["0"];');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
