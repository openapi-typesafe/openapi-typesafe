import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import transformSchema from "../../src/api/transform-schema.js";
import { astToString, type GeneratorOptions, type OpenAPI3 } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum` of a schema that narrows an enum it inherits through `allOf` (`Cat: allOf: [$ref: Pet,
 * { mode: [a] }]`): typed by the base's enum members, not by an enum of its own (ADR-021).
 */

const CODE = "(ENUM_VALUES_NOT_INHERITED)";
const PET_REF = { $ref: "#/components/schemas/Pet" };

const enumOf = (values: string[]) => ({ type: "string", enum: values });
const objectOf = (properties: Record<string, unknown>) => ({ type: "object", properties });
const PET = objectOf({
  mode: enumOf(["a", "b", "c"]),
  list: { type: "array", items: enumOf(["a", "b", "c"]) },
  status: { $ref: "#/components/schemas/Status" },
  record: { type: "object", additionalProperties: enumOf(["a", "b"]) },
});
const STATUS = enumOf(["on", "off"]);

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

/** The output and the warnings of a run over `Pet`, `Status` and `schemas`. */
async function run(schemas: Record<string, unknown>, options: GeneratorOptions = { enum: true }) {
  const logger = new RecordingLogger();
  const ports = await defaultGeneratorPorts(options, logger);
  const document = documentWith({ Pet: PET, Status: STATUS, ...schemas });
  const { schema, ctx } = await createDocumentRun(document, options, ports);
  const output = astToString(transformSchema(schema, ctx));
  return { output, warnings: logger.messages("warn").filter((line) => line.endsWith(CODE)) };
}

const cat = (properties: Record<string, unknown>) => ({ allOf: [PET_REF, objectOf(properties)] });

describe("--enum of an allOf item that narrows an inherited enum", () => {
  it("openapiTS types an inline item's property by the base's enum members", async () => {
    const { output, warnings } = await run({ Cat: cat({ mode: enumOf(["a"]) }) });

    expect(output).toContain('Cat: components["schemas"]["Pet"] & {\n');
    expect(output).toMatch(/mode\?: PetMode\.a;\n\s+\};/);
    expect(warnings).toEqual([]);
  });

  it("openapiTS keeps declaring the schema's own enum", async () => {
    const { output } = await run({ Cat: cat({ mode: enumOf(["a"]) }) });

    expect(output).toContain('export enum CatMode {\n    a = "a"\n}');
  });

  it("openapiTS output admits the listed value and rejects another", async () => {
    const { output } = await run({ Cat: cat({ mode: enumOf(["a"]) }) });
    const use = 'const cat: components["schemas"]["Cat"] = { mode: PetMode.a };';
    const misuse = 'const cat: components["schemas"]["Cat"] = { mode: PetMode.b };';

    expect(typeErrorsOf(`${output}\n${use}`)).toEqual([]);
    expect(typeErrorsOf(`${output}\n${misuse}`)).not.toEqual([]);
  });

  it("openapiTS narrows the schema's own keywords next to the $ref", async () => {
    const dog = { ...objectOf({ mode: enumOf(["b"]) }), allOf: [PET_REF] };

    const { output } = await run({ Dog: dog });

    expect(output).toMatch(/Dog: \{\n.*\n\s+mode\?: PetMode\.b;/);
  });

  it.each([
    ["array items", { list: { type: "array", items: enumOf(["b"]) } }, "list?: PetList.b[];"],
    [
      "record values",
      { record: { type: "object", additionalProperties: enumOf(["a"]) } },
      "[key: string]: PetRecord.a;",
    ],
    ["an enum the base has through a $ref", { status: enumOf(["on"]) }, "status?: Status.on;"],
  ])("openapiTS narrows %s by the base's enum", async (_shape, properties, expected) => {
    const { output } = await run({ Cat: cat(properties) });

    expect(output).toContain(expected);
  });

  it("openapiTS follows a $ref in the base on the way to the enum", async () => {
    const base = objectOf({ list: { $ref: "#/components/schemas/List" } });
    const list = { type: "array", items: enumOf(["x", "y"]) };
    const schemas = {
      Base: base,
      List: list,
      Leaf: {
        allOf: [{ $ref: "#/components/schemas/Base" }, objectOf({ list: { type: "array", items: enumOf(["x"]) } })],
      },
    };

    const { output } = await run(schemas);

    expect(output).toContain("list?: List.x[];");
  });

  it("openapiTS with values the base does not list types the common ones and warns once", async () => {
    const schemas = { Cat: cat({ mode: enumOf(["a", "d"]) }), Ref: { $ref: "#/components/schemas/Cat" } };

    const { output, warnings } = await run(schemas);

    expect(output).toMatch(/mode\?: PetMode\.a;\n\s+\};/);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('#/components/schemas/Cat/mode: the enum lists "d"');
    expect(warnings[0]).toContain("The type lists the values both enums list.");
  });

  it("openapiTS without a common value keeps the own enum and says the type is never", async () => {
    const { output, warnings } = await run({ Cat: cat({ mode: enumOf(["x"]) }) });

    expect(output).toMatch(/mode\?: CatMode;/);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("no common value, so the type is never");
  });

  it("openapiTS keeps the own enum of a property the allOf leaves out of the base", async () => {
    const pet = { ...PET, required: ["mode"], discriminator: { propertyName: "mode" } };
    const document = { Pet: pet, Cat: cat({ mode: enumOf(["Cat", "x"]) }) };

    const { output, warnings } = await run(document);

    expect(output).toContain('Omit<components["schemas"]["Pet"], "mode">');
    expect(output).not.toMatch(/mode\??: PetMode\./);
    expect(warnings).toEqual([]);
  });

  it("openapiTS without --enum does not change the type or warn", async () => {
    const { output, warnings } = await run({ Cat: cat({ mode: enumOf(["a", "d"]) }) }, {});

    expect(output).toMatch(/mode\?: "a" \| "d";/);
    expect(warnings).toEqual([]);
  });

  it.each([
    ["--dedupe-enums", { enum: true, dedupeEnums: true }],
    ["--fix all", { enum: true, dedupeEnums: true, fix: ["all"] }],
    ["--enum-values", { enum: true, enumValues: true }],
  ] as [string, GeneratorOptions][])(
    "openapiTS with %s types the narrowed property by a value",
    async (_flags, options) => {
      const { output } = await run(
        { Cat: cat({ mode: enumOf(["a"]), list: { type: "array", items: enumOf(["b"]) } }) },
        options,
      );
      const checks = [
        'type CatValue = NonNullable<components["schemas"]["Cat"]["mode"]>;',
        "const admitted: [CatValue] extends [never] ? false : true = true;",
        'type ListValue = NonNullable<components["schemas"]["Cat"]["list"]>[number];',
        "const listed: [ListValue] extends [never] ? false : true = true;",
      ];

      expect(typeErrorsOf(`${output}\n${checks.join("\n")}`)).toEqual([]);
    },
  );
});

describe("--enum places a base does or does not reach", () => {
  const holder = (inner: Record<string, unknown>) =>
    objectOf({ holder: { ...objectOf({ mode: enumOf(["a", "b"]) }), ...inner } });

  it("openapiTS narrows each variant of a union, which the base intersects", async () => {
    const variants = { anyOf: [enumOf(["a"]), enumOf(["b"])] };

    const { output } = await run({ Cat: cat({ mode: variants }) });

    expect(output).toMatch(/mode\?: PetMode\.a \| PetMode\.b;/);
  });

  it("openapiTS narrows the object of a type list, which is typed once per listed type", async () => {
    const base = holder({});
    const own = objectOf({ holder: { type: ["object", "null"], properties: { mode: enumOf(["a"]) } } });
    const schemas = { Base: base, Leaf: { allOf: [{ $ref: "#/components/schemas/Base" }, own] } };

    const { output } = await run(schemas);

    expect(output).toContain("mode?: BaseHolderMode.a;");
  });

  it("openapiTS keeps the own enum of a $defs entry, which no base reaches", async () => {
    const defs = { $defs: { Inner: objectOf({ mode: enumOf(["a"]) }) } };
    const item = { type: "object", ...defs };

    const { output } = await run({ Cat: { allOf: [PET_REF, item] } });

    expect(output).not.toContain("PetMode.a");
  });

  it("openapiTS warns once where a member types the union's own keywords again", async () => {
    const base = objectOf({ mode: enumOf(["a", "b"]) });
    const union = {
      type: "object",
      discriminator: { propertyName: "kind" },
      properties: { kind: { type: "string" } },
      allOf: [{ $ref: "#/components/schemas/Base" }, objectOf({ mode: enumOf(["a", "d"]) })],
      oneOf: [{ $ref: "#/components/schemas/Leaf" }],
    };
    const leaf = { allOf: [{ $ref: "#/components/schemas/Union" }] };

    const { warnings } = await run({ Base: base, Union: union, Leaf: leaf });

    expect(warnings).toHaveLength(1);
  });
});
