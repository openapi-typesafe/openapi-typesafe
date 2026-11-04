import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `discriminator-values` fix (ADR-021, roadmap R12, backlog 26). */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const KIND = { kind: { type: "string" } };
const CAT_PROPERTIES = { type: "object", properties: { meow: { type: "boolean" } } };

function pet(mapping: Record<string, string>, propertyName = "kind") {
  return { type: "object", required: [propertyName], properties: KIND, discriminator: { propertyName, mapping } };
}

function shelter(discriminator: Record<string, unknown>) {
  return { type: "object", properties: { resident: { oneOf: [ref("Cat")], discriminator } } };
}

/** `Pet` maps `cat` to `Cat`; `Shelter` names `Cat` in a discriminated `oneOf` without a mapping. */
const CONFLICT = {
  Pet: pet({ cat: "#/components/schemas/Cat" }),
  Cat: { allOf: [ref("Pet"), CAT_PROPERTIES] },
  Shelter: shelter({ propertyName: "kind" }),
};

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(documentWith(structuredClone(schemas)), { silent: true, ...options }));
}

async function fixed(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return generate(schemas, { fix: ["discriminator-values"], ...options });
}

/** The literal `kind` values of the output; `Pet` declares `kind` as a plain string. */
function kindsOf(output: string): string[] {
  return [...output.matchAll(/^ {12}kind: ("[^;]+);$/gm)].map((match) => match[1] ?? "");
}

describe("discriminator-values fix", () => {
  it("openapiTS without the fix gives both values, which intersect to never", async () => {
    expect(kindsOf(await generate(CONFLICT))).toEqual(['"Cat"', '"cat"']);
  });

  it("openapiTS with the fix gives the mapped value only", async () => {
    expect(kindsOf(await fixed(CONFLICT))).toEqual(['"cat"']);
  });

  it("openapiTS with the fix keeps the schema name where no mapping names the schema", async () => {
    const schemas = { Cat: { type: "object", properties: KIND }, Shelter: shelter({ propertyName: "kind" }) };

    expect(kindsOf(await fixed(schemas))).toEqual(['"Cat"']);
  });

  it("openapiTS with the fix changes nothing where every value comes from the schema name", async () => {
    const schemas = { ...CONFLICT, Pet: { type: "object", properties: KIND, discriminator: { propertyName: "kind" } } };

    expect(await fixed(schemas)).toBe(await generate(schemas));
  });

  it("openapiTS with the fix gives one value for two oneOf schemas without a mapping", async () => {
    const schemas = {
      Cat: { type: "object", properties: KIND },
      Shelter: shelter({ propertyName: "kind" }),
      Vet: shelter({ propertyName: "kind" }),
    };

    expect(kindsOf(await fixed(schemas))).toEqual(['"Cat"']);
  });

  it("openapiTS with the fix merges two mappings that give the schema different values", async () => {
    const schemas = { ...CONFLICT, Shelter: shelter({ propertyName: "kind", mapping: { feline: ref("Cat").$ref } }) };

    expect(kindsOf(await fixed(schemas))).toEqual(['"feline" | "cat"']);
  });

  it("openapiTS with the fix gives one value when two mappings agree", async () => {
    const schemas = { ...CONFLICT, Shelter: shelter({ propertyName: "kind", mapping: { cat: ref("Cat").$ref } }) };

    expect(kindsOf(await fixed(schemas))).toEqual(['"cat"']);
  });

  it("openapiTS with the fix merges into an object schema's own property", async () => {
    const schemas = {
      Cat: { type: "object", properties: KIND },
      Shelter: shelter({ propertyName: "kind", mapping: { cat: ref("Cat").$ref } }),
      Vet: shelter({ propertyName: "kind", mapping: { feline: ref("Cat").$ref } }),
    };

    expect(kindsOf(await fixed(schemas))).toEqual(['"cat" | "feline"']);
  });

  it("openapiTS with the fix keeps two properties for two discriminator properties", async () => {
    const schemas = { ...CONFLICT, Shelter: shelter({ propertyName: "species" }) };

    const output = await fixed(schemas);

    expect(kindsOf(output)).toEqual(['"cat"']);
    expect(output).toContain('species: "Cat";');
  });

  it("openapiTS with the fix and enum declares the enum once with the mapped value", async () => {
    const output = await fixed(CONFLICT, { enum: true });

    expect(output.match(/export enum CatKind \{\n {4}cat = "cat"\n\}/g)).toHaveLength(1);
    expect(output).not.toContain('Cat = "Cat"');
  });

  it("openapiTS with the fix gives a type that values have and the union narrows by", async () => {
    const code = `${await fixed(CONFLICT)}
const cat: components["schemas"]["Cat"] = { kind: "cat", meow: true };
export function meows(shelter: components["schemas"]["Shelter"]): boolean | undefined {
  return shelter.resident?.kind === "cat" ? shelter.resident.meow : undefined;
}
// @ts-expect-error the schema name is not the mapped value
const named: components["schemas"]["Cat"] = { kind: "Cat" };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });
});
