import { describe, expect, it } from "vitest";
import { defaultGeneratorPorts, generateDeclarations } from "../../src/api/openapi-ts.js";
import { astToString } from "../../src/index.js";
import type { GeneratorOptions } from "../../src/types.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum-values` arrays whose location type does not hold their values are typed by their own
 * values (ADR-027), and discriminator values that the property enum does not allow are reported.
 */

async function run(schemas: Record<string, unknown>, options: GeneratorOptions = {}) {
  const document = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas },
  };
  const ports = await defaultGeneratorPorts({ silent: true });
  const logger = new RecordingLogger();
  const declarations = await generateDeclarations(
    JSON.stringify(document),
    { silent: true, enumValues: true, ...options },
    { ...ports, logger },
  );
  return { output: astToString(declarations), warnings: logger.messages("warn") };
}

const STRING_ENUM = (values: string[]) => ({ type: "string", enum: values });

describe("--enum-values location check", () => {
  it("generateDeclarations keeps the location type where it holds the values", async () => {
    const { output, warnings } = await run({
      A: { type: "object", properties: { status: STRING_ENUM(["a", "b"]) } },
      Map: { type: "object", additionalProperties: STRING_ENUM(["p"]) },
      Tags: { type: "array", items: STRING_ENUM(["x"]) },
      Open: { type: "object", properties: { s: { anyOf: [STRING_ENUM(["o"]), { type: "string" }] } } },
    });

    expect(output).toContain('ReadonlyArray<FlattenedDeepRequired<components>["schemas"]["A"]["status"]>');
    expect(output).toContain('ReadonlyArray<FlattenedDeepRequired<components>["schemas"]["Map"][string]>');
    expect(output).toContain('ReadonlyArray<FlattenedDeepRequired<components>["schemas"]["Tags"]>');
    expect(output).toContain('ReadonlyArray<FlattenedDeepRequired<components>["schemas"]["Open"]["s"]>');
    expect(warnings).toEqual([]);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations types an array by its values where the location has no such key", async () => {
    const { output, warnings } = await run({
      P: {
        type: "object",
        properties: { x: { type: "string" }, st: STRING_ENUM(["o"]) },
        anyOf: [{ required: ["x"] }],
      },
      U: {
        type: "object",
        properties: { u: { anyOf: [{ type: "array", items: STRING_ENUM(["a"]) }, STRING_ENUM([""])] } },
      },
    });

    expect(output).toContain('pStValues: ReadonlyArray<"o"> = ["o"];');
    expect(output).toContain('uUAnyOf0Values: ReadonlyArray<"a"> = ["a"];');
    expect(warnings).toEqual([]);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations reads a union with an unknown member as unknown", async () => {
    // `{ … } | unknown | { m?: "m1" }` is `unknown`: `Extract` on it finds no member with `m`.
    const { output } = await run({
      Unk: {
        type: "object",
        properties: { x: { type: "string" } },
        anyOf: [{ required: ["x"] }, { type: "object", properties: { m: STRING_ENUM(["m1"]) } }],
      },
    });

    expect(output).toContain('unkAnyOf1MValues: ReadonlyArray<"m1"> = ["m1"];');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations warns where an allOf of enums excludes listed values", async () => {
    const { output, warnings } = await run({
      Base: { type: "object", properties: { state: STRING_ENUM(["open", "converting"]) } },
      Created: {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          { type: "object", properties: { state: STRING_ENUM(["open", "locked"]) } },
        ],
      },
    });

    expect(output).toContain('createdStateValues: ReadonlyArray<"open" | "locked">');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(
      'createdStateValues: the generated type at the location of this enum does not admit "locked"',
    );
    expect(warnings[0]).toMatch(/ \(ENUM_VALUES_EXCLUDED\)$/);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations checks an allOf of a referenced enum and a wider enum", async () => {
    const { output, warnings } = await run({
      Frequency: STRING_ENUM(["weekly", "monthly", "quarterly", "yearly"]),
      FrequencyResponse: {
        allOf: [
          { $ref: "#/components/schemas/Frequency" },
          STRING_ENUM(["weekly", "monthly", "quarterly", "yearly", "not-applicable"]),
        ],
      },
    });

    expect(output).toContain(
      'frequencyResponseValues: ReadonlyArray<"weekly" | "monthly" | "quarterly" | "yearly" | "not-applicable">',
    );
    expect(warnings).toHaveLength(1);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations checks an array inside objects TypeScript reduces to never", async () => {
    const item = (bounce: string[]) => ({
      type: "object",
      required: ["bounce"],
      properties: { bounce: STRING_ENUM(bounce), name: STRING_ENUM(["sent"]) },
    });
    const { output } = await run({
      Kept: { allOf: [item(["soft", "hard"]), item(["hard"])] },
      Reduced: { allOf: [item(["soft", "hard"]), item(["blocked"])] },
    });

    expect(output).toContain("keptNameValues: ReadonlyArray<FlattenedDeepRequired<components>");
    expect(output).toContain('reducedNameValues: ReadonlyArray<"sent">');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations reads Omit where a discriminator narrows an inherited property", async () => {
    const { output } = await run({
      Base: {
        type: "object",
        required: ["type"],
        properties: { type: { type: "string" } },
        additionalProperties: true,
        discriminator: { propertyName: "type" },
      },
      Selector: {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          { type: "object", properties: { type: STRING_ENUM(["branches", "tags"]) } },
        ],
      },
    });

    expect(output).toContain('selectorTypeValues: ReadonlyArray<"branches" | "tags">');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations leaves arrays alone without --enum-values", async () => {
    const { output } = await run({ A: STRING_ENUM(["a"]) }, { enumValues: false });

    expect(output).not.toContain("Values");
  });
});

describe("discriminator value warnings", () => {
  const schemas = (mapping?: Record<string, string>) => ({
    Base: { type: "object", properties: { type: STRING_ENUM(["episode"]) } },
    Episode: { allOf: [{ $ref: "#/components/schemas/Base" }] },
    Holder: {
      type: "object",
      properties: {
        item: {
          oneOf: [{ $ref: "#/components/schemas/Episode" }],
          discriminator: { propertyName: "type", ...(mapping ? { mapping } : {}) },
        },
      },
    },
  });

  it("generateDeclarations warns about an implicit value the property enum does not list", async () => {
    const { output, warnings } = await run(schemas());

    const discriminator = warnings.filter((warning) => warning.startsWith("#/"));
    expect(discriminator).toHaveLength(1);
    expect(discriminator[0]).toContain(
      '#/components/schemas/Episode: the discriminator "type" of #/components/schemas/Holder/properties/item gives this schema the value "Episode"',
    );
    expect(discriminator[0]).toContain('add a mapping entry such as "episode": "#/components/schemas/Episode"');
    expect(discriminator[0]).toMatch(/ \(DISCRIMINATOR_VALUE_NOT_ALLOWED\)$/);
    expect(output).toContain('episodeTypeValues: ReadonlyArray<"Episode">');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations warns about a mapped value the property enum does not list", async () => {
    const { warnings } = await run(schemas({ show: "#/components/schemas/Episode" }));

    expect(warnings.some((warning) => warning.includes('the value "show"'))).toBe(true);
    expect(warnings.some((warning) => warning.includes("maps these values"))).toBe(true);
  });

  it("generateDeclarations does not warn where the mapping gives an allowed value", async () => {
    const { warnings } = await run(schemas({ episode: "#/components/schemas/Episode" }), { enumValues: false });

    expect(warnings).toEqual([]);
  });

  it("generateDeclarations does not count the owner's own property for an inheriting member", async () => {
    const { warnings } = await run(
      {
        Pet: {
          type: "object",
          properties: { kind: STRING_ENUM(["cat", "dog"]) },
          discriminator: { propertyName: "kind" },
        },
        Cat: { allOf: [{ $ref: "#/components/schemas/Pet" }] },
        Dog: {
          allOf: [{ $ref: "#/components/schemas/Pet" }, { type: "object", properties: { kind: { const: "dog" } } }],
        },
      },
      { enumValues: false },
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('#/components/schemas/Dog: the discriminator "kind"');
  });

  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const kindOf = (value: string) => ({ type: "object", properties: { kind: STRING_ENUM([value]) } });

  it("generateDeclarations warns about a member that inherits through an allOf chain", async () => {
    const { warnings } = await run(
      {
        Pet: { type: "object", properties: { kind: { type: "string" } }, discriminator: { propertyName: "kind" } },
        Cat: { allOf: [ref("Pet"), kindOf("Cat")] },
        Lion: { allOf: [ref("Cat"), kindOf("lion")] },
      },
      { enumValues: false },
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('#/components/schemas/Lion: the discriminator "kind" of #/components/schemas/Pet');
    expect(warnings[0]).toContain('does not allow ("lion")');
  });

  it("generateDeclarations does not follow a chain past a schema with its own discriminator", async () => {
    const { warnings } = await run(
      {
        Pet: { type: "object", properties: { kind: { type: "string" } }, discriminator: { propertyName: "kind" } },
        Cat: {
          allOf: [ref("Pet"), kindOf("Cat")],
          discriminator: { propertyName: "kind", mapping: { lion: ref("Lion").$ref } },
        },
        Lion: { allOf: [ref("Cat"), kindOf("lion")] },
      },
      { enumValues: false },
    );

    expect(warnings).toEqual([]);
  });

  it("generateDeclarations with allof-discriminated-union does not warn about a schema that reuses a union", async () => {
    const schemas = {
      Pet: { oneOf: [ref("Cat")], discriminator: { propertyName: "kind" } },
      Cat: kindOf("Cat"),
      CatResponse: { allOf: [ref("Pet"), kindOf("Cat")] },
      Child: { allOf: [ref("CatResponse"), kindOf("Cat")] },
    };

    const fixed = await run(schemas, { enumValues: false, fix: ["allof-discriminated-union"] });
    const unfixed = await run(schemas, { enumValues: false });

    expect(fixed.warnings).toEqual([]);
    expect(unfixed.warnings).toHaveLength(2);
  });
});
