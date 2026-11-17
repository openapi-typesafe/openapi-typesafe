import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum` of an enum narrowed through more than one `allOf` level, and of a discriminator value
 * a member declares next to the property the scan adds (ADR-021).
 */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const enumOf = (values: string[]) => ({ type: "string", enum: values });
const objectOf = (properties: Record<string, unknown>) => ({ type: "object", properties });

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = { enum: true }) {
  const components = { schemas: structuredClone(schemas) };
  const document = { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {}, components };
  return astToString(await openapiTS(document as OpenAPI3, { silent: true, ...options }));
}

/** Lines that fail to compile where `schema[key]` has no value. */
function admits(schema: string, key: string): string {
  return [
    `type Value = NonNullable<components["schemas"]["${schema}"]["${key}"]>;`,
    "const admitted: [Value] extends [never] ? false : true = true;",
  ].join("\n");
}

describe("--enum of an enum narrowed through allOf chains", () => {
  const pet = objectOf({ mode: enumOf(["a", "b", "c"]) });

  it("openapiTS types a grandchild by the farthest base's enum", async () => {
    const schemas = {
      Pet: pet,
      Cat: { allOf: [ref("Pet"), objectOf({ mode: enumOf(["a", "b"]) })] },
      Kitten: { allOf: [ref("Cat"), objectOf({ mode: enumOf(["a"]) })] },
    };

    const output = await generate(schemas);

    expect(output).toMatch(/Kitten: components\["schemas"\]\["Cat"\] & \{\n.*\n\s+mode\?: PetMode\.a;/);
    expect(typeErrorsOf(`${output}\n${admits("Kitten", "mode")}`)).toEqual([]);
  });

  it("openapiTS reads a base property that sits in the base's own allOf item", async () => {
    const schemas = {
      Base: { allOf: [objectOf({ mode: enumOf(["a", "b"]) })] },
      Leaf: { allOf: [ref("Base"), objectOf({ mode: enumOf(["b"]) })] },
    };

    const output = await generate(schemas);

    expect(output).toContain("mode?: BaseMode.b;");
  });

  it("openapiTS types a middle base's own keywords and its child by the farthest base", async () => {
    const schemas = {
      Pet: pet,
      Cat: { allOf: [ref("Pet")], properties: { mode: enumOf(["a", "b"]) } },
      Kitten: { allOf: [ref("Cat"), objectOf({ mode: enumOf(["a"]) })] },
    };

    const output = await generate(schemas);

    expect(output).toContain("mode?: PetMode.a | PetMode.b;");
    expect(output).toMatch(/Kitten: components\["schemas"\]\["Cat"\] & \{\n.*\n\s+mode\?: PetMode\.a;/);
  });

  it("openapiTS uses the enum of a middle base where the farthest one has none", async () => {
    const schemas = {
      Pet: objectOf({ mode: { type: "string" } }),
      Cat: { allOf: [ref("Pet"), objectOf({ mode: enumOf(["a", "b"]) })] },
      Kitten: { allOf: [ref("Cat"), objectOf({ mode: enumOf(["a"]) })] },
    };

    const output = await generate(schemas);

    expect(output).toContain("mode?: CatMode.a;");
  });

  it("openapiTS ends at an allOf cycle and still types the place", async () => {
    const schemas = {
      Loop: { allOf: [ref("Loop"), objectOf({ mode: enumOf(["a", "b"]) })] },
      Leaf: { allOf: [ref("Loop"), objectOf({ mode: enumOf(["a"]) })] },
    };

    const output = await generate(schemas);

    expect(output).toContain("mode?: LoopMode.a;");
  });

  it("openapiTS leaves out a discriminator property that a base's allOf item omits", async () => {
    const owner = {
      ...objectOf({ kind: enumOf(["cat", "dog"]) }),
      required: ["kind"],
      discriminator: { propertyName: "kind" },
    };
    const schemas = {
      Pet: owner,
      Holder: objectOf({ pet: { allOf: [ref("Pet")] } }),
      Leaf: { allOf: [ref("Holder"), objectOf({ pet: objectOf({ kind: enumOf(["cat"]) }) })] },
    };

    const output = await generate(schemas);

    expect(output).toContain('Omit<components["schemas"]["Pet"], "kind">');
    expect(output).not.toContain("PetKind.cat");
  });
});

describe("--enum of a discriminator value a member declares", () => {
  const PET = {
    ...objectOf({ kind: { type: "string" } }),
    required: ["kind"],
    discriminator: { propertyName: "kind", mapping: { cat: "#/components/schemas/Cat" } },
  };

  it.each([
    ["an optional const in an allOf item", { allOf: [ref("Pet"), objectOf({ kind: { const: "cat" } })] }],
    [
      "a required const in an allOf item",
      { allOf: [ref("Pet"), { ...objectOf({ kind: { const: "cat" } }), required: ["kind"] }] },
    ],
    ["a const next to the allOf", { allOf: [ref("Pet")], properties: { kind: { const: "cat" } } }],
  ])("openapiTS types %s by the added enum's member", async (_shape, member) => {
    const output = await generate({ Pet: PET, Cat: member });

    expect(output).toMatch(/kind\??: CatKind;[\s\S]*kind: CatKind;/);
    expect(typeErrorsOf(`${output}\n${admits("Cat", "kind")}`)).toEqual([]);
  });

  it("openapiTS with discriminator-values types a declared enum by the owner's enum member", async () => {
    const owner = { ...PET, properties: { kind: enumOf(["cat", "dog"]) } };
    const member = { allOf: [ref("Pet"), objectOf({ kind: enumOf(["cat"]) })] };

    const output = await generate({ Pet: owner, Cat: member }, { enum: true, fix: ["discriminator-values"] });

    expect(output).toMatch(
      /Cat: Omit<components\["schemas"\]\["Pet"\], "kind"> & \{\n.*\n\s+kind: PetKind\.cat;\n\s+\};/,
    );
    expect(output).toContain("export enum CatKind {");
    expect(typeErrorsOf(`${output}\n${admits("Cat", "kind")}`)).toEqual([]);
  });

  it("openapiTS with discriminator-values types every declaration of the value alike", async () => {
    const owner = { ...PET, properties: { kind: enumOf(["cat", "dog"]) } };
    const declared = objectOf({ kind: enumOf(["cat"]) });
    const member = { ...declared, allOf: [ref("Pet"), declared] };

    const output = await generate({ Pet: owner, Cat: member }, { enum: true, fix: ["discriminator-values"] });

    expect(output.match(/kind: PetKind\.cat;/g)).toHaveLength(2);
    expect(typeErrorsOf(`${output}\n${admits("Cat", "kind")}`)).toEqual([]);
  });
});
