import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `allof-discriminated-union` fix (ADR-024, upstream #1464, #1690). */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const PET_TYPE = (value: string) => ({ type: "object", properties: { pet_type: { type: "string", enum: [value] } } });

/** Upstream #1690: `A` is a discriminated union; `B` and `Extended` are `A`, not its members. */
const SCHEMAS = {
  A: {
    oneOf: [ref("C"), ref("D")],
    discriminator: { propertyName: "pet_type", mapping: { c: ref("C").$ref, d: ref("D").$ref } },
  },
  B: { allOf: [ref("A")] },
  Extended: { allOf: [ref("A")], properties: { prop: { type: "string" } } },
  C: PET_TYPE("c"),
  D: PET_TYPE("d"),
};

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.0.3", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(documentWith(structuredClone(schemas)), { silent: true, ...options }));
}

async function fixed(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return generate(schemas, { fix: ["allof-discriminated-union"], ...options });
}

describe("allof-discriminated-union fix", () => {
  it("openapiTS without the fix omits the property and adds the schema name", async () => {
    const output = await generate(SCHEMAS);

    expect(output).toContain(`B: {
            pet_type: "B";
        } & Omit<components["schemas"]["A"], "pet_type">;`);
  });

  it("openapiTS with the fix types an allOf of the union as the union", async () => {
    const output = await fixed(SCHEMAS);

    expect(output).toContain('B: components["schemas"]["A"];');
    expect(output).toContain(`Extended: {
            prop?: string;
        } & components["schemas"]["A"];`);
  });

  it("openapiTS with the fix gives types that values have and that narrow", async () => {
    const code = `${await fixed(SCHEMAS)}
const b: components["schemas"]["B"] = { pet_type: "c" };
export function isC(extended: components["schemas"]["Extended"]): boolean {
  return extended.pet_type === "c";
}
// @ts-expect-error the schema name is not a value of the union
const named: components["schemas"]["B"] = { pet_type: "B" };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS with the fix does not pass the discriminator on to a schema that allOf the result", async () => {
    const output = await fixed({
      ...SCHEMAS,
      Child: { allOf: [ref("B"), { properties: { age: { type: "integer" } } }] },
    });

    expect(output).toContain(`Child: components["schemas"]["B"] & {
            age?: number;
        };`);
  });

  it("openapiTS with the fix types the union of upstream #1464 inside a response", async () => {
    const schemas = {
      allData: {
        type: "object",
        discriminator: { propertyName: "my_type" },
        required: ["my_type"],
        oneOf: [ref("data1"), ref("data2")],
      },
      data1: PET_TYPE("x"),
      data2: PET_TYPE("y"),
      Response: { title: "performRequest Response", allOf: [ref("allData")] },
    };

    expect(await fixed(schemas)).toContain('Response: components["schemas"]["allData"];');
  });

  it("openapiTS with the fix keeps Omit for a parent that is not a union", async () => {
    const parent = {
      type: "object",
      properties: { kind: { type: "string" } },
      discriminator: { propertyName: "kind" },
    };
    const schemas = { Pet: parent, Cat: { allOf: [ref("Pet")] } };

    expect(await fixed(schemas)).toBe(await generate(schemas));
  });

  it("openapiTS with the fix keeps the union's own properties for its members", async () => {
    const union = {
      type: "object",
      properties: { kind: { type: "string" }, id: { type: "string" } },
      discriminator: { propertyName: "kind" },
      oneOf: [ref("Cat")],
    };
    const schemas = { Pet: union, Cat: { allOf: [ref("Pet"), { properties: { meow: { type: "boolean" } } }] } };

    expect(await fixed(schemas)).toBe(await generate(schemas));
  });

  it("openapiTS with the fix keeps a schema that the mapping names a member of the union", async () => {
    const mapping = { c: ref("C").$ref, d: ref("D").$ref, resp: ref("Response").$ref };
    const schemas = {
      A: { oneOf: [ref("C"), ref("D")], discriminator: { propertyName: "pet_type", mapping } },
      C: PET_TYPE("c"),
      D: PET_TYPE("d"),
      Response: { allOf: [ref("A"), { type: "object", properties: { extra: { type: "string" } } }] },
    };
    const code = `${await fixed(schemas)}
const response: components["schemas"]["Response"] = { pet_type: "resp", extra: "x" };`;

    expect(await fixed(schemas)).toBe(await generate(schemas));
    expect(typeErrorsOf(code)).toEqual([]);
  });
});
