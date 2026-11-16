import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * A schema `$ref` to the discriminator property of a mapped schema (ADR-026). The discriminator
 * scan replaces that property with the enum of the member's values, so `Dog["kind"]` reads the
 * injected `"dog"`, not the schema the pointer names: the pointer is typed by that schema.
 */

const ref = (pointer: string) => ({ $ref: `#/components/schemas/${pointer}` });

function documentOf(kind: object, extra: Record<string, unknown> = {}): OpenAPI3 {
  const schemas = {
    Dog: { type: "object", required: ["kind"], properties: { kind } },
    Any: {
      oneOf: [ref("Dog")],
      discriminator: { propertyName: "kind", mapping: { dog: "#/components/schemas/Dog" } },
    },
    Note: { type: "object", properties: { animalKind: ref("Dog/properties/kind") } },
    ...extra,
  };
  const info = { title: "t", version: "1" };
  return { openapi: "3.1.0", info, paths: {}, components: { schemas } } as unknown as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}) {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

/** The type of `Note.animalKind` in the output. */
function animalKindOf(output: string): string | undefined {
  return /animalKind\?: ([^;]*);/.exec(output)?.[1];
}

describe("schema $refs to the discriminator property of a mapped schema", () => {
  it.each([
    ["the defaults", {}],
    ["every fix", { fix: ["all"] }],
  ] as const)("openapiTS with %s types a pointer to a replaced string by its schema", async (_label, options) => {
    const output = await generate(documentOf({ type: "string" }), options as OpenAPITSOptions);

    expect(animalKindOf(output)).toBe("string");
    expect(output).toMatch(/kind: "dog";/);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types a pointer to a replaced enum of other values by that enum", async () => {
    const output = await generate(documentOf({ type: "string", enum: ["dog", "cat"] }));

    expect(animalKindOf(output)).toBe('"dog" | "cat"');
  });

  it("openapiTS keeps the pointer where the replaced enum lists exactly the member's values", async () => {
    const output = await generate(documentOf({ type: "string", enum: ["dog"] }));

    expect(animalKindOf(output)).toBe('components["schemas"]["Dog"]["kind"]');
  });

  it("openapiTS follows a replaced $ref and types its target", async () => {
    const output = await generate(documentOf(ref("Kind"), { Kind: { type: "string", enum: ["dog", "cat"] } }));

    expect(animalKindOf(output)).toBe('components["schemas"]["Kind"]');
  });

  it("openapiTS keeps the pointer where a replaced $ref lists exactly the member's values", async () => {
    const output = await generate(documentOf(ref("Kind"), { Kind: { type: "string", enum: ["dog"] } }));

    expect(animalKindOf(output)).toBe('components["schemas"]["Dog"]["kind"]');
  });

  it("openapiTS with --enum types a pointer to a replaced enum of other values by the whole enum", async () => {
    const output = await generate(documentOf({ type: "string", enum: ["dog", "cat"] }), { enum: true });

    expect(animalKindOf(output)).toBe("DogKind");
    expect(output).toContain("kind: DogKind.dog;");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the pointer to a property the scan did not replace", async () => {
    const document = documentOf({ type: "string" });
    const schemas = document.components?.schemas as Record<string, { properties: object }>;
    schemas.Dog?.properties && Object.assign(schemas.Dog.properties, { name: { type: "string" } });
    schemas.Note = { properties: { animalKind: ref("Dog/properties/name") } };

    expect(animalKindOf(await generate(document))).toBe('components["schemas"]["Dog"]["name"]');
  });
});
