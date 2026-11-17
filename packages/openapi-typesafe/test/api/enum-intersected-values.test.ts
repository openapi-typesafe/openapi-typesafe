import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import transformSchema from "../../src/api/transform-schema.js";
import { astToString, type GeneratorOptions, type OpenAPI3 } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum` values that an `allOf` intersects in another form: a literal (`const`, an enum
 * `--enum` keeps as a union) next to a TypeScript enum, or the other way round. An enum member
 * is no literal, so each such pair was `never`; the value is typed in the form the other schema
 * admits it in (ADR-021).
 */

const CODE = "(ENUM_VALUES_NOT_INHERITED)";
const PET_REF = { $ref: "#/components/schemas/Pet" };

const enumOf = (values: unknown[]) => ({ type: "string", enum: values });
const objectOf = (properties: Record<string, unknown>) => ({ type: "object", properties });
const cat = (properties: Record<string, unknown>) => ({ allOf: [PET_REF, objectOf(properties)] });

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  const components = { schemas };
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {}, components } as OpenAPI3;
}

async function run(schemas: Record<string, unknown>, options: GeneratorOptions = { enum: true }) {
  const logger = new RecordingLogger();
  const ports = await defaultGeneratorPorts(options, logger);
  const { schema, ctx } = await createDocumentRun(documentWith(schemas), options, ports);
  const output = astToString(transformSchema(schema, ctx));
  return { output, warnings: logger.messages("warn").filter((line) => line.endsWith(CODE)) };
}

/** Lines that fail to compile where `Cat[key]` (or another schema's) has no value. */
function admitsValues(keys: readonly string[], schema = "Cat"): string {
  return keys
    .map((key, index) =>
      [
        `type Value${index} = NonNullable<components["schemas"]["${schema}"]["${key}"]>;`,
        `const admitted${index}: [Value${index}] extends [never] ? false : true = true;`,
      ].join("\n"),
    )
    .join("\n");
}

describe("--enum literals narrowing an inherited enum", () => {
  const pet = objectOf({ mode: enumOf(["a", "b"]), num: { type: "integer", enum: [1, 2] } });

  it("openapiTS types a const of a base's enum by its members", async () => {
    const schemas = { Pet: pet, Cat: cat({ mode: { const: "a" }, num: { const: 1 } }) };

    const { output, warnings } = await run(schemas);

    expect(output).toContain("mode?: PetMode.a;");
    expect(output).toContain("num?: PetNum.Value1;");
    expect(typeErrorsOf(`${output}\n${admitsValues(["mode", "num"])}`)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("openapiTS types an enum --conditional-enums keeps as literals by the base's members", async () => {
    const named = { ...enumOf(["a", "b"]), "x-enum-varnames": ["A", "B"] };
    const schemas = { Pet: objectOf({ mode: named }), Cat: cat({ mode: enumOf(["a"]) }) };

    const { output } = await run(schemas, { enum: true, conditionalEnums: true });

    expect(output).toContain("mode?: PetMode.A;");
  });

  it("openapiTS keeps null of a nullable literal next to the base's members", async () => {
    const nullable = { type: ["string", "null"], enum: ["a", null] };
    const schemas = { Pet: pet, Cat: cat({ mode: nullable }) };

    const { output } = await run(schemas);

    expect(output).toContain("mode?: PetMode.a | null;");
  });

  it("openapiTS keeps null of an enum whose type does not list null", async () => {
    const schemas = { Pet: pet, Cat: cat({ mode: { type: "string", enum: ["a", null] } }) };

    const { output } = await run(schemas);

    expect(output).toContain("mode?: PetMode.a | null;");
  });

  it("openapiTS keeps a const that an open base enum admits as another string", async () => {
    const open = { ...enumOf(["a", "b"]), additionalProperties: true };
    const schemas = { Pet: objectOf({ mode: open }), Cat: cat({ mode: { const: "x" } }) };

    const { output, warnings } = await run(schemas);

    expect(output).toContain('mode?: "x";');
    expect(warnings).toEqual([]);
  });

  it("openapiTS keeps the order of literals that a base admits in their form", async () => {
    const pet = objectOf({ mode: { anyOf: [{ const: "a" }, { type: "string" }] } });
    const own = { type: ["string", "null"], enum: ["x", "a", "y", null] };

    const { output } = await run({ Pet: pet, Cat: cat({ mode: own }) });

    expect(output).toContain('mode?: "x" | "a" | "y" | null;');
  });

  it("openapiTS keeps the order of literals that a literal base lists or leaves open", async () => {
    const pet = objectOf({ mode: { type: ["string", "null"], enum: ["a", null] } });
    const own = { type: ["string", "null"], enum: ["x", "a", "y", null] };

    const { output } = await run({ Pet: pet, Cat: cat({ mode: own }) });

    expect(output).toContain('mode?: "x" | "a" | "y" | null;');
  });

  it("openapiTS warns about a literal the base's enum does not list the base's enum does not list", async () => {
    const schemas = { Pet: pet, Cat: cat({ mode: { type: ["string", "null"], enum: ["a", "d", null] } }) };

    const { output, warnings } = await run(schemas);

    expect(output).toContain("mode?: PetMode.a | null;");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('the schema lists "d"');
  });

  it("openapiTS keeps a const no enum member can be, and one next to a literal base", async () => {
    const base = objectOf({ mode: enumOf(["a", "b"]), flag: { const: "x" }, open: { type: "string" } });
    const own = { mode: { const: true }, flag: { const: "x" }, open: { const: "a" } };
    const schemas = { Pet: base, Cat: cat(own) };

    const { output } = await run(schemas);

    expect(output).toContain("mode?: true;");
    expect(output).toContain('flag?: "x";');
    expect(output).toContain('open?: "a";');
  });
});

describe("--enum enums narrowing an inherited literal", () => {
  it("openapiTS types an enum by the base's literals where --enum keeps the base a union", async () => {
    const pet = objectOf({ mode: { type: ["string", "null"], enum: ["a", "b", null] } });
    const schemas = { Pet: pet, Cat: cat({ mode: enumOf(["a"]) }) };

    const { output, warnings } = await run(schemas);

    expect(output).toContain('mode?: "a";');
    expect(output).toContain("export enum CatMode {");
    expect(typeErrorsOf(`${output}\n${admitsValues(["mode"])}`)).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("openapiTS warns about an enum value the base's literals do not list", async () => {
    const pet = objectOf({ mode: { const: "a" } });
    const schemas = { Pet: pet, Cat: cat({ mode: enumOf(["a", "d"]) }) };

    const { output, warnings } = await run(schemas);

    expect(output).toContain('mode?: "a";');
    expect(warnings).toHaveLength(1);
  });

  it("openapiTS with nullable-enums keeps the base's own enum members", async () => {
    const pet = objectOf({ mode: { type: ["string", "null"], enum: ["a", "b", null] } });
    const schemas = { Pet: pet, Cat: cat({ mode: enumOf(["a"]) }) };

    const { output } = await run(schemas, { enum: true, fix: ["nullable-enums"] });

    expect(output).toContain("mode?: PetMode.a;");
  });
});

describe("--enum base enums inside a wrapper or a union", () => {
  const STATUS = enumOf(["on", "off"]);
  const STATUS_REF = { $ref: "#/components/schemas/Status" };

  it.each([
    ["a one-item allOf with a description", { allOf: [STATUS_REF], description: "d" }],
    ["a oneOf with null", { oneOf: [STATUS_REF, { type: "null" }] }],
    ["an anyOf with null", { anyOf: [STATUS_REF, { type: "null" }] }],
    ["an allOf of an allOf", { allOf: [{ allOf: [STATUS_REF] }] }],
  ])("openapiTS types an enum by the members of %s", async (_shape, wrapped) => {
    const schemas = { Status: STATUS, Pet: objectOf({ mode: wrapped }), Cat: cat({ mode: enumOf(["on"]) }) };

    const { output } = await run(schemas);

    expect(output).toContain("mode?: Status.on;");
    expect(typeErrorsOf(`${output}\n${admitsValues(["mode"])}`)).toEqual([]);
  });

  it("openapiTS types a union's enum variant and keeps the other variants", async () => {
    const union = { anyOf: [enumOf(["u", "v"]), { type: "integer" }] };
    const narrowed = { oneOf: [enumOf(["u"]), { type: "integer" }] };
    const pet = objectOf({ uni: union, one: { oneOf: union.anyOf } });
    const schemas = { Pet: pet, Cat: cat({ uni: enumOf(["u"]), one: narrowed }) };

    const { output } = await run(schemas);

    expect(output).toContain("uni?: PetUniAnyOf0.u;");
    expect(output).toContain("one?: PetOneOneOf0.u | number;");
  });

  it("openapiTS keeps an enum where a variant of the base admits any string", async () => {
    const pet = objectOf({ mode: { anyOf: [enumOf(["a", "b"]), { type: "string" }] } });
    const schemas = { Pet: pet, Cat: cat({ mode: enumOf(["a"]) }) };

    const { output, warnings } = await run(schemas);

    expect(output).toContain("mode?: CatMode;");
    expect(warnings).toEqual([]);
  });

  it("openapiTS keeps an enum where a variant of the base is an object", async () => {
    const pet = objectOf({ mode: { anyOf: [enumOf(["a", "b"]), objectOf({ x: {} })] } });
    const schemas = { Pet: pet, Cat: cat({ mode: enumOf(["a"]) }) };

    const { output } = await run(schemas);

    expect(output).toContain("mode?: CatMode;");
  });

  it("openapiTS keeps an enum where a variant of the base has no type", async () => {
    const pet = objectOf({ mode: { anyOf: [enumOf(["a", "b"]), { description: "any" }] } });

    const { output } = await run({ Pet: pet, Cat: cat({ mode: enumOf(["a"]) }) });

    expect(output).toContain("mode?: CatMode;");
  });

  it("openapiTS keeps an enum without a warning where no variant of the base lists values", async () => {
    const pet = objectOf({ mode: { anyOf: [{ type: "integer" }, { type: "boolean" }] } });

    const { output, warnings } = await run({ Pet: pet, Cat: cat({ mode: enumOf(["a"]) }) });

    expect(output).toContain("mode?: CatMode;");
    expect(warnings).toEqual([]);
  });
});

describe("--enum literals next to an enum of the same place", () => {
  const named = { ...enumOf(["a", "b"]), "x-enum-varnames": ["A", "B"] };

  it("openapiTS types a property's literal by an inline allOf item's enum members", async () => {
    const mixed = { ...objectOf({ mode: enumOf(["a"]) }), allOf: [objectOf({ mode: named })] };

    const { output } = await run({ Mixed: mixed }, { enum: true, conditionalEnums: true });

    expect(output).toContain("mode?: MixedMode.A;");
    expect(output).toContain("mode?: MixedMode;");
    expect(typeErrorsOf(`${output}\n${admitsValues(["mode"], "Mixed")}`)).toEqual([]);
  });

  it("openapiTS types an inline item's const by the property's enum, also in its items", async () => {
    const list = (items: unknown) => ({ type: "array", items });
    const own = objectOf({ mode: enumOf(["a", "b"]), list: list(enumOf(["a", "b"])) });
    const item = objectOf({ mode: { const: "a" }, list: list({ const: "b" }) });

    const { output } = await run({ Mixed: { ...own, allOf: [item] } });

    expect(output).toContain("mode?: MixedMode.a;");
    expect(output).toContain("mode?: MixedMode;");
    expect(output).toContain("list?: MixedList.b[];");
    expect(typeErrorsOf(`${output}\n${admitsValues(["mode"], "Mixed")}`)).toEqual([]);
  });

  it("openapiTS types a literal by an enum in an allOf item's own allOf", async () => {
    const nested = { allOf: [objectOf({ mode: enumOf(["a", "b"]) })] };

    const { output } = await run({ Mixed: { ...objectOf({ mode: { const: "a" } }), allOf: [nested] } });

    expect(output).toContain("mode?: MixedMode.a;");
  });

  it("openapiTS types an enum by the members of a later item's union variant, once", async () => {
    const variant = { anyOf: [enumOf(["a", "b"]), { type: "null" }] };
    const own = objectOf({ mode: enumOf(["a"]) });

    const { output } = await run({ Mixed: { ...own, allOf: [objectOf({ mode: variant })] } });

    expect(output).toContain("mode?: MixedModeAnyOf0.a;");
    expect(output).toContain("mode?: MixedModeAnyOf0 | null;");
    expect(typeErrorsOf(`${output}\n${admitsValues(["mode"], "Mixed")}`)).toEqual([]);
  });

  it("openapiTS types an earlier item's enum by a later one and keeps what it does not list", async () => {
    const item = objectOf({ mode: enumOf(["a", "b"]) });
    const variant = objectOf({ mode: { oneOf: [enumOf(["a"]), { type: "null" }] } });

    const { output } = await run({ Mixed: { type: "object", allOf: [item, variant] } });

    expect(output).toContain("mode?: MixedModeOneOf0 | MixedMode.b;");
    expect(output).toContain("mode?: MixedModeOneOf0 | null;");
    expect(typeErrorsOf(`${output}\n${admitsValues(["mode"], "Mixed")}`)).toEqual([]);
  });

  it("openapiTS keeps a literal that an inline enum next to it does not list", async () => {
    const own = objectOf({ mode: { type: ["string", "null"], enum: ["a", "x", null] } });

    const { output, warnings } = await run({ Mixed: { ...own, allOf: [objectOf({ mode: enumOf(["a", "b"]) })] } });

    expect(output).toContain('mode?: (MixedMode.a | "x") | null;');
    expect(warnings).toEqual([]);
  });

  it("openapiTS types a literal variant by the enum of the place it is a variant of", async () => {
    const own = objectOf({ mode: { anyOf: [{ const: "a" }, { type: "null" }] } });

    const { output } = await run({ Mixed: { ...own, allOf: [objectOf({ mode: enumOf(["a", "b"]) })] } });

    expect(output).toContain("mode?: MixedMode.a | null;");
  });

  it("openapiTS keeps a literal next to an inline union that admits it", async () => {
    const own = objectOf({ mode: { const: "a" } });
    const item = objectOf({ mode: { anyOf: [enumOf(["a"]), { type: "string" }] } });

    const { output } = await run({ Mixed: { ...own, allOf: [item] } });

    expect(output).toContain('mode?: "a";');
  });

  it("openapiTS without --enum leaves the literals as they are", async () => {
    const mixed = { ...objectOf({ mode: { const: "a" } }), allOf: [objectOf({ mode: enumOf(["a", "b"]) })] };

    const { output } = await run({ Mixed: mixed }, {});

    expect(output).toContain('mode?: "a";');
    expect(output).toContain('mode?: "a" | "b";');
  });
});
