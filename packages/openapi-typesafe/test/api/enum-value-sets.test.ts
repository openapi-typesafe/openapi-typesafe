import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type GeneratorOptions, NULL, type OpenAPI3, tsUnion } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum` requests of one owner with other values (a property and an inline `allOf` item of one
 * schema): one enum with every value, and each request typed by its own values.
 */

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(document: OpenAPI3, options: GeneratorOptions = { enum: true }): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

const enumOf = (values: unknown[]) => ({ type: "string", enum: values });
const modeOf = (values: unknown[]) => ({ type: "object", properties: { mode: enumOf(values) } });
const T = { ...modeOf(["a"]), allOf: [modeOf(["a", "b"])], additionalProperties: modeOf(["a"]) };
const T_MODE = 'export enum TMode {\n    a = "a",\n    b = "b"\n}';

function declaredEnumNames(output: string): string[] {
  return [...output.matchAll(/^export (?:const )?enum ([\w$]+)/gm)].map((match) => match[1] as string);
}

function repeatedNames(names: readonly string[]): string[] {
  return names.filter((name, index) => names.indexOf(name) !== index);
}

describe("--enum requests of one owner with other values", () => {
  it("openapiTS declares the owner's enum once with every value", async () => {
    const output = await generate(documentWith({ T }));

    expect(output).toContain(T_MODE);
    expect(repeatedNames(declaredEnumNames(output))).toEqual([]);
  });

  it("openapiTS types the own property of fewer values by its members", async () => {
    const output = await generate(documentWith({ T }));

    expect(output).toContain("mode?: TMode.a;");
    expect(output).toContain("mode?: TMode;");
  });

  it("openapiTS output rejects a value the own property does not list", async () => {
    const output = await generate(documentWith({ T }));
    const misuse = 'const t: components["schemas"]["T"] = { mode: TMode.b };';
    const use = 'const t: components["schemas"]["T"] = { mode: TMode.a };';

    expect(typeErrorsOf(`${output}\n${use}`)).toEqual([]);
    expect(typeErrorsOf(`${output}\n${misuse}`)).not.toEqual([]);
  });

  it("openapiTS types an allOf item of fewer values than the own property by its members", async () => {
    const output = await generate(documentWith({ T: { ...modeOf(["a", "b"]), allOf: [modeOf(["b"])] } }));

    expect(output).toContain(T_MODE);
    expect(output).toContain("mode?: TMode.b;");
  });

  it("openapiTS with --dedupe-enums types a schema sharing the enum by its own values", async () => {
    const schemas = { T: { ...modeOf(["a"]), allOf: [modeOf(["a", "b"])] }, U: modeOf(["a"]) };

    const output = await generate(documentWith(schemas), { enum: true, dedupeEnums: true });

    expect(output).toMatch(/U: \{\n.*\n\s+mode\?: TMode\.a;/);
    expect(repeatedNames(declaredEnumNames(output))).toEqual([]);
  });

  it("openapiTS with nullable-enums narrows the enum next to null", async () => {
    const own = { type: "object", properties: { mode: { type: ["string", "null"], enum: ["a", null] } } };
    const schemas = { T: { ...own, allOf: [modeOf(["a", "b"])] } };

    const output = await generate(documentWith(schemas), { enum: true, fix: ["nullable-enums"] });

    expect(output).toContain("mode?: TMode.a | null;");
  });

  it("openapiTS narrows the enum a postTransform callback hands back in a union", async () => {
    const output = await generate(documentWith({ T }), {
      enum: true,
      irCallbacks: true,
      postTransform: (type) => (type.kind === "reference" ? tsUnion([type, NULL]) : undefined),
    });

    expect(output).toContain("mode?: TMode.a | null;");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps an enum a postTransform callback writes as text the whole enum", async () => {
    const output = await generate(documentWith({ T }), {
      enum: true,
      irCallbacks: true,
      postTransform: (type) => (type.kind === "reference" ? `${type.name} | undefined` : undefined),
    });

    expect(output).toContain("mode?: TMode | undefined;");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS returns no listed values on the references of its output", async () => {
    const declarations = await openapiTS(documentWith({ T }), { silent: true, enum: true });

    expect(JSON.stringify(declarations)).not.toContain("enumValues");
  });
});

/** Shapes whose locations ask for an enum more than once, from the `--enum` tests. */
const SHAPES: Record<string, Record<string, unknown>> = {
  ownAndAllOf: { T },
  twoAllOfItems: { T: { allOf: [modeOf(["a", "b"]), modeOf(["b", "c"])] } },
  numbers: {
    T: {
      type: "object",
      properties: { n: { type: "integer", enum: [1] } },
      allOf: [{ type: "object", properties: { n: { type: "integer", enum: [1, 2] } } }],
    },
  },
  textAndNumber: {
    T: {
      type: "object",
      properties: { n: { enum: ["1"] } },
      allOf: [{ type: "object", properties: { n: { enum: [1, "1"] } } }],
    },
  },
  memberNames: { T: { ...modeOf(["a-b"]), allOf: [modeOf(["a b"])] } },
  tuple: { Shape: { type: "array", prefixItems: [modeOf(["x"]), { ...modeOf(["x"]), allOf: [modeOf(["x", "y"])] }] } },
  records: { S: { ...modeOf(["on"]), allOf: [modeOf(["on", "off"])], additionalProperties: modeOf(["on", "off"]) } },
  discriminator: {
    Pet: {
      required: ["mode"],
      ...modeOf(["cat", "dog"]),
      allOf: [modeOf(["cat", "dog", "bird"])],
      discriminator: { propertyName: "mode", mapping: { cat: "#/components/schemas/Cat" } },
    },
    Cat: { allOf: [{ $ref: "#/components/schemas/Pet" }, { type: "object" }] },
  },
  pointers: { T, R: { $ref: "#/components/schemas/T/properties/mode" } },
};

const OPTION_SETS: Record<string, GeneratorOptions> = {
  enum: { enum: true },
  dedupe: { enum: true, dedupeEnums: true },
  dedupeNames: { enum: true, dedupeEnums: true, fix: ["dedupe-enum-names"] },
  all: { enum: true, enumValues: true, fix: ["all"] },
  alphabetize: { enum: true, alphabetize: true, rootTypes: true },
};

describe("--enum declarations over the enum test shapes", () => {
  const cases = Object.keys(SHAPES).flatMap((shape) => Object.keys(OPTION_SETS).map((set) => [shape, set]));

  it.each(cases)("openapiTS declares each enum of %s once with %s, and the output compiles", async (shape, set) => {
    const output = await generate(documentWith(SHAPES[shape] ?? {}), OPTION_SETS[set]);

    expect(repeatedNames(declaredEnumNames(output))).toEqual([]);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
