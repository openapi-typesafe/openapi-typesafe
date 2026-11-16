import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type GeneratorOptions, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum` requests that TypeScript intersects (a property and an inline `allOf` item of one
 * schema, and the items, record values, tuple elements and nested properties inside them) share
 * one enum under every enum flag set, so no intersection of them is `never` (ADR-021).
 */

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: GeneratorOptions): Promise<string> {
  return astToString(await openapiTS(documentWith(schemas), { silent: true, ...options }));
}

const FLAG_SETS: [string, GeneratorOptions][] = [
  ["--enum", { enum: true }],
  ["--enum --enum-values", { enum: true, enumValues: true }],
  ["--enum --dedupe-enums", { enum: true, dedupeEnums: true }],
  ["--enum --dedupe-enums --fix dedupe-enum-names", { enum: true, dedupeEnums: true, fix: ["dedupe-enum-names"] }],
  ["--enum --dedupe-enums --fix all", { enum: true, dedupeEnums: true, fix: ["all"] }],
];

const enumOf = (values: string[]) => ({ type: "string", enum: values });
const objectOf = (properties: Record<string, unknown>) => ({ type: "object", properties });

/** A schema whose own `key` and inline `allOf` item `key` wrap enums of `own` and `inherited`. */
function intersected(wrap: (values: string[]) => unknown, own: string[], inherited: string[]) {
  return { ...objectOf({ key: wrap(own) }), allOf: [objectOf({ key: wrap(inherited) })] };
}

/** A shape of the intersected value, and the TypeScript type of its enum inside `T["key"]`. */
const SHAPES: [string, (values: string[]) => unknown, string][] = [
  ["a property", enumOf, "Key"],
  ["array items", (values) => ({ type: "array", items: enumOf(values) }), "Key[number]"],
  ["record values", (values) => ({ type: "object", additionalProperties: enumOf(values) }), "Key[string]"],
  [
    "pattern property values",
    (values) => ({ type: "object", patternProperties: { "^x": enumOf(values) } }),
    "Key[string]",
  ],
  ["tuple elements", (values) => ({ type: "array", prefixItems: [enumOf(values)] }), "Key[0]"],
  ["nested properties", (values) => objectOf({ mode: enumOf(values) }), "NonNullable<Key['mode']>"],
];

function declaredEnumNames(output: string): string[] {
  return [...output.matchAll(/^export (?:const )?enum ([\w$]+)/gm)].map((match) => match[1] as string);
}

/** Lines that fail to compile when the enum at `path` of `T` is `never`. */
function admitsAValue(path: string): string {
  return [
    'type Key = NonNullable<components["schemas"]["T"]["key"]>;',
    `type Found = ${path};`,
    "const admitted: [Found] extends [never] ? false : true = true;",
  ].join("\n");
}

describe.each(FLAG_SETS)("%s requests that TypeScript intersects", (_flags, options) => {
  it.each(SHAPES)("openapiTS gives %s of a property and an inline allOf item one enum", async (_shape, wrap, path) => {
    // `Other` lists the same values as the own request, which `--dedupe-enums` once shared.
    const schemas = { T: intersected(wrap, ["a"], ["a", "b"]), Other: wrap(["a"]) };

    const output = await generate(schemas, options);
    const names = declaredEnumNames(output);

    expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
    expect(typeErrorsOf(`${output}\n${admitsAValue(path)}`)).toEqual([]);
  });

  it("openapiTS output rejects a value the own property does not list", async () => {
    const schemas = { T: intersected(enumOf, ["a"], ["a", "b"]), Other: enumOf(["a"]) };

    const output = await generate(schemas, options);
    const enumName = /key\?: (\w+)\.a;/.exec(output)?.[1];
    const misuse = `const t: components["schemas"]["T"] = { key: ${enumName}.b };`;
    const use = `const t: components["schemas"]["T"] = { key: ${enumName}.a };`;

    expect(typeErrorsOf(`${output}\n${use}`)).toEqual([]);
    expect(typeErrorsOf(`${output}\n${misuse}`)).not.toEqual([]);
  });

  it("openapiTS gives an owner whose whole values another schema lists its own enum", async () => {
    // `--dedupe-enums` shares an enum only between owners of the same whole values.
    const schemas = {
      Alpha: objectOf({ key: enumOf(["a", "b"]) }),
      T: intersected(enumOf, ["a", "b"], ["a", "b", "c"]),
    };

    const output = await generate(schemas, options);

    expect(typeErrorsOf(`${output}\n${admitsAValue("Key")}`)).toEqual([]);
    expect(output).toMatch(/Alpha: \{\n.*\n\s+key\?: AlphaKey;/);
  });
});

describe("--enum --dedupe-enums of a discriminated union whose own enum an allOf item widens", () => {
  const pet = {
    type: "object",
    required: ["kind"],
    properties: { kind: enumOf(["cat", "dog", "bird"]) },
    allOf: [objectOf({ kind: enumOf(["cat", "dog", "bird", "fish"]) })],
    discriminator: { propertyName: "kind", mapping: { cat: "#/components/schemas/Cat" } },
  };
  const cat = { allOf: [{ $ref: "#/components/schemas/Pet" }, objectOf({ meow: { type: "boolean" } })] };

  it.each(FLAG_SETS)("openapiTS with %s types the union and its member by values", async (_flags, options) => {
    const output = await generate({ Pet: pet, Cat: cat, Same: enumOf(["cat", "dog", "bird"]) }, options);
    const use = ["Pet", "Cat"].map(
      (name) => `const is${name}: [components["schemas"]["${name}"]["kind"]] extends [never] ? false : true = true;`,
    );

    expect(typeErrorsOf(`${output}\n${use.join("\n")}`)).toEqual([]);
  });
});

describe("--enum slots of one location", () => {
  it("openapiTS keeps the properties of a tuple's rest items apart from its first element's", async () => {
    const kindOf = (values: string[]) => objectOf({ kind: enumOf(values) });
    const shape = { type: "array", prefixItems: [kindOf(["a"])], items: kindOf(["b"]) };

    const output = await generate({ Shape: shape }, { enum: true, fix: ["prefix-items"] });

    expect(declaredEnumNames(output).sort()).toEqual(["ShapeKind", "ShapeKind_2"]);
  });

  it("openapiTS keeps the items of an array apart from the record values of an object", async () => {
    const both = { type: ["array", "object"], items: enumOf(["a"]), additionalProperties: enumOf(["b"]) };

    const output = await generate({ Both: both }, { enum: true });

    expect(declaredEnumNames(output)).toEqual(["Both", "Both_2"]);
  });

  it.each(FLAG_SETS)(
    "openapiTS with %s gives a record value of the own values the own enum",
    async (_flags, options) => {
      const settings = {
        ...objectOf({ mode: enumOf(["on"]) }),
        additionalProperties: objectOf({ mode: enumOf(["on"]) }),
      };

      const output = await generate({ Settings: settings }, options);

      expect(declaredEnumNames(output)).toEqual(["SettingsMode"]);
    },
  );
});
