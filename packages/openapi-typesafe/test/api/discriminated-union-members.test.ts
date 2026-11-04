import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * A discriminated union whose members `allOf` the union (upstream #1665). The output referred to
 * itself (TS2502), so it is fixed by default; every other output stays as it was.
 */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const MAPPING = { DOG: "#/components/schemas/Dog", CAT: "#/components/schemas/Cat" };

function animal(extra: Record<string, unknown> = {}) {
  return {
    type: "object",
    required: ["type"],
    properties: { type: { type: "string" }, id: { type: "string" } },
    discriminator: { propertyName: "type", mapping: MAPPING },
    oneOf: [ref("Dog"), ref("Cat")],
    ...extra,
  };
}

/** The union without its members: a parent that its members `allOf`. */
function parent() {
  const { oneOf: _members, ...rest } = animal();
  return rest;
}

function member(properties: Record<string, unknown>, parent = "Animal") {
  return { type: "object", allOf: [ref(parent), { type: "object", properties }] };
}

const MEMBERS = {
  Cat: member({ age: { type: "integer" } }),
  Dog: member({ name: { type: "string" } }),
};

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.0.1", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(documentWith(structuredClone(schemas)), { silent: true, ...options }));
}

/** The text of one schema member of `components`, up to the next one. */
function schemaText(output: string, name: string): string {
  const lines = output.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`        ${name}: `));
  const length = lines.slice(start + 1).findIndex((line) => /^ {8}[$\w]+: |^ {4}\};/.test(line));
  return lines.slice(start, start + 1 + length).join("\n");
}

describe("discriminated union members", () => {
  it("openapiTS gives members the union's own properties instead of the union", async () => {
    const output = await generate({ Animal: animal(), ...MEMBERS });

    expect(schemaText(output, "Cat")).toBe(`        Cat: {
            id?: string;
        } & {
            age?: number;
        } & {
            /**
             * @description discriminator enum property added by openapi-typesafe
             * @enum {string}
             */
            type: "CAT";
        } & {
            /**
             * @description discriminator enum property added by openapi-typesafe
             * @enum {string}
             */
            type: "CAT";
        };`);
  });

  it("openapiTS gives types that compile, that values have and that the union narrows by", async () => {
    const code = `${await generate({ Animal: animal(), ...MEMBERS })}
const cat: components["schemas"]["Cat"] = { type: "CAT", id: "1", age: 2 };
export function ageOf(animal: components["schemas"]["Animal"]): number | undefined {
  return animal.type === "CAT" ? animal.age : undefined;
}`;

    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS leaves the union out of a member when it has no other properties", async () => {
    const schemas = { Animal: animal({ properties: { type: { type: "string" } } }), ...MEMBERS };

    const output = await generate(schemas);

    expect(schemaText(output, "Dog")).toMatch(/^ {8}Dog: \{\n {12}name\?: string;\n {8}\} & \{/);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the union's own allOf parent and required keys", async () => {
    const schemas = {
      Base: { type: "object", properties: { created: { type: "string" } } },
      Animal: animal({ allOf: [ref("Base")], required: ["type", "id"] }),
      ...MEMBERS,
    };

    const output = await generate(schemas);

    expect(schemaText(output, "Cat")).toContain(`Cat: ({
            id: string;
        } & components["schemas"]["Base"]) & {`);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS breaks a cycle through an intermediate parent", async () => {
    const schemas = {
      Animal: animal({ oneOf: [ref("Cat")], discriminator: { propertyName: "type" } }),
      Mammal: member({ fur: { type: "boolean" } }),
      Cat: member({ age: { type: "integer" } }, "Mammal"),
    };

    const output = await generate(schemas);

    expect(schemaText(output, "Mammal")).not.toContain('components["schemas"]["Animal"]');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS breaks the cycle of an anyOf union and of a union member behind allOf", async () => {
    const schemas = {
      Animal: { ...parent(), anyOf: [ref("Dog"), { allOf: [ref("Cat")] }] },
      ...MEMBERS,
    };

    expect(typeErrorsOf(await generate(schemas))).toEqual([]);
  });

  it("openapiTS with --enum declares the union's enums once", async () => {
    const status = { type: "string", enum: ["new", "old"] };
    const schemas = { Animal: animal({ properties: { type: { type: "string" }, status } }), ...MEMBERS };

    const output = await generate(schemas, { enum: true });

    expect(output.match(/export enum AnimalStatus /g)).toHaveLength(1);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with --enum-values declares the union's value arrays once", async () => {
    const status = { type: "string", enum: ["new", "old"] };
    const schemas = { Animal: animal({ properties: { type: { type: "string" }, status } }), ...MEMBERS };

    const output = await generate(schemas, { enumValues: true });

    expect(output.match(/export const animalStatusValues/g)).toHaveLength(1);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps Omit for a union that does not contain the schema", async () => {
    const schemas = { Animal: animal(), ...MEMBERS, Pet: { allOf: [ref("Animal")] } };

    expect(await generate(schemas)).toContain('Omit<components["schemas"]["Animal"], "type">');
  });

  it("openapiTS keeps Omit for a parent that is not a union", async () => {
    const schemas = { Animal: parent(), ...MEMBERS };

    expect(schemaText(await generate(schemas), "Cat")).toContain('Omit<components["schemas"]["Animal"], "type">');
  });

  it("openapiTS keeps a member that is behind a property of the union", async () => {
    const schemas = {
      Animal: animal({ oneOf: [{ type: "object", properties: { cat: ref("Cat") } }, ref("Dog")] }),
      ...MEMBERS,
    };

    expect(schemaText(await generate(schemas), "Cat")).toContain('Omit<components["schemas"]["Animal"], "type">');
  });
});
