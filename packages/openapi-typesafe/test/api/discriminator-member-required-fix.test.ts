import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `discriminator-member-required` fix (ADR-024, upstream #2162). */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

/** Upstream #2162: `UpdatePet` makes `CatProps` a discriminator member; `Cat` requires `kittens`. */
const SCHEMAS = {
  CatProps: { type: "object", properties: { kittens: { type: "number" } } },
  Cat: { type: "object", required: ["kittens"], allOf: [ref("CatProps")] },
  UpdatePet: {
    oneOf: [ref("CatProps")],
    discriminator: { propertyName: "sound", mapping: { meow: ref("CatProps").$ref } },
  },
};

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.0.0", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(documentWith(structuredClone(schemas)), { silent: true, ...options }));
}

async function fixed(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return generate(schemas, { fix: ["discriminator-member-required"], ...options });
}

describe("discriminator-member-required fix", () => {
  it("openapiTS without the fix drops WithRequired for a discriminator member", async () => {
    expect(await generate(SCHEMAS)).toContain('Cat: components["schemas"]["CatProps"];');
  });

  it("openapiTS with the fix keeps WithRequired for a discriminator member", async () => {
    expect(await fixed(SCHEMAS)).toContain('Cat: WithRequired<components["schemas"]["CatProps"], "kittens">;');
  });

  it("openapiTS with the fix gives the same type as without the discriminator", async () => {
    const { UpdatePet: _union, ...withoutUnion } = SCHEMAS;

    expect(await fixed(SCHEMAS)).toContain((await generate(withoutUnion)).match(/ {8}Cat: [^\n]+/)?.[0] ?? "missing");
  });

  it("openapiTS with the fix leaves out the discriminator property, which the member requires", async () => {
    const schemas = { ...SCHEMAS, Cat: { ...SCHEMAS.Cat, required: ["kittens", "sound"] } };

    expect(await fixed(schemas)).toContain('Cat: WithRequired<components["schemas"]["CatProps"], "kittens">;');
  });

  it("openapiTS with the fix adds no WithRequired when only the discriminator property is required", async () => {
    const schemas = { ...SCHEMAS, Cat: { ...SCHEMAS.Cat, required: ["sound"] } };

    expect(await fixed(schemas)).toContain('Cat: components["schemas"]["CatProps"];');
  });

  it("openapiTS with the fix gives a type that requires the key", async () => {
    const code = `${await fixed(SCHEMAS)}
const cat: components["schemas"]["Cat"] = { sound: "meow", kittens: 2 };
// @ts-expect-error kittens is required
const none: components["schemas"]["Cat"] = { sound: "meow" };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });
});
