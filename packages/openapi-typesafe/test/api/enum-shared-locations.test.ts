import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum` enums of schemas typed at a location they share with other schemas: the properties of
 * tuple elements, of array items and of record values are named after their holder's location,
 * so an enum there with other values is another enum, and no schema accepts another's values.
 */

function documentWith(schemas: Record<string, unknown>, paths: Record<string, unknown> = {}): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths, components: { schemas } } as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = { enum: true }): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

const kindOf = (values: string[]) => ({ type: "object", properties: { kind: { enum: values } } });
const modeOf = (values: string[]) => ({ type: "object", properties: { mode: { enum: values } } });
const SHAPE = { type: "array", prefixItems: [kindOf(["point"]), kindOf(["line"])] };
const SETTINGS = { ...modeOf(["auto", "manual"]), additionalProperties: modeOf(["on", "off"]) };

function enumsNamed(output: string, name: string): string[] {
  return output.match(new RegExp(`export enum ${name}(_\\d+)? `, "g")) ?? [];
}

describe("--enum at a location shared by other schemas", () => {
  it("openapiTS numbers the enum of a tuple element's property with other values", async () => {
    const output = await generate(documentWith({ Shape: SHAPE }));

    expect(enumsNamed(output, "ShapeKind")).toEqual(["export enum ShapeKind ", "export enum ShapeKind_2 "]);
    expect(output).toMatch(/export enum ShapeKind_2 \{\n\s+line = "line"\n\s*\}/);
  });

  it("openapiTS types each tuple element's property so it rejects the other's value", async () => {
    const output = await generate(documentWith({ Shape: SHAPE }));
    const misuse = 'const shape: components["schemas"]["Shape"] = [{ kind: "line" }, { kind: "point" }];';

    expect(typeErrorsOf(output)).toEqual([]);
    expect(typeErrorsOf(`${output}\n${misuse}`)).not.toEqual([]);
  });

  it("openapiTS numbers the enum of a record value's property next to an own property", async () => {
    const output = await generate(documentWith({ Settings: SETTINGS }));

    expect(output).toMatch(/export enum SettingsMode_2 \{\n\s+on = "on",\n\s+off = "off"\n\s*\}/);
    expect(output).toContain("mode?: SettingsMode_2;");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it.each([
    ["patternProperties", { ...modeOf(["auto"]), patternProperties: { "^x-": modeOf(["on"]) } }],
    ["unevaluatedProperties", { ...modeOf(["auto"]), unevaluatedProperties: modeOf(["on"]) }],
    ["items", { ...modeOf(["auto"]), type: ["object", "array"], items: modeOf(["on"]) }],
    ["an items list", { type: "array", items: [modeOf(["auto"]), modeOf(["on"])] }],
  ])("openapiTS numbers the enum of a property in %s with other values", async (_keyword, schema) => {
    const options = { enum: true, fix: ["unevaluated-properties"] } as OpenAPITSOptions;

    const output = await generate(documentWith({ Settings: schema }), options);

    expect(enumsNamed(output, "SettingsMode")).toEqual(["export enum SettingsMode ", "export enum SettingsMode_2 "]);
  });

  it("openapiTS shares one enum between shared-location properties of the same values", async () => {
    const schemas = { Shape: { type: "array", prefixItems: [kindOf(["a", "b"]), kindOf(["b", "a"])] } };

    const output = await generate(documentWith(schemas));

    expect(enumsNamed(output, "ShapeKind")).toEqual(["export enum ShapeKind "]);
  });

  it("openapiTS shares the own property's enum with a record value's property of its values", async () => {
    const schemas = { Settings: { ...modeOf(["on", "off"]), additionalProperties: modeOf(["off", "on"]) } };

    const output = await generate(documentWith(schemas));

    expect(enumsNamed(output, "SettingsMode")).toEqual(["export enum SettingsMode "]);
  });

  it("openapiTS shares the enum of an inline allOf item's property with a record value's", async () => {
    const schemas = { Settings: { allOf: [modeOf(["fast", "slow"])], additionalProperties: modeOf(["fast", "slow"]) } };
    const usage = 'const own: components["schemas"]["Settings"]["mode"] = SettingsMode.fast;';

    const output = await generate(documentWith(schemas));

    expect(enumsNamed(output, "SettingsMode")).toEqual(["export enum SettingsMode "]);
    expect(typeErrorsOf(`${output}\n${usage}`)).toEqual([]);
  });

  it("openapiTS keeps a record value's enum apart from an own enum an allOf item widens", async () => {
    const schemas = {
      Settings: { ...modeOf(["a"]), additionalProperties: modeOf(["a"]), allOf: [modeOf(["a", "b"])] },
    };
    const misuse = 'const value: components["schemas"]["Settings"][string] = { mode: SettingsMode.b };';

    const output = await generate(documentWith(schemas));

    expect(output).toMatch(/export enum SettingsMode_2 \{\n\s+a = "a"\n\s*\}/);
    expect(output).not.toMatch(/export enum SettingsMode_2 \{\n\s+b/);
    expect(typeErrorsOf(output)).toEqual([]);
    expect(typeErrorsOf(`${output}\n${misuse}`)).not.toEqual([]);
  });

  it("openapiTS still shares one enum between a property and its inline allOf item's", async () => {
    const schemas = { Pet: { ...kindOf(["a", "b"]), allOf: [kindOf(["a"])] } };

    const output = await generate(documentWith(schemas));

    expect(enumsNamed(output, "PetKind")).toEqual(["export enum PetKind "]);
  });

  it("openapiTS types a $ref to a tuple element's property with that property's enum", async () => {
    const ref = "#/components/schemas/Shape/prefixItems/1/properties/kind";

    const output = await generate(documentWith({ Shape: SHAPE, Ref: { $ref: ref } }));

    expect(output).toContain("Ref: ShapeKind_2;");
    expect(output).not.toContain("ShapeKind_3");
  });

  it("openapiTS types a $ref to a record value's property with that property's enum", async () => {
    const ref = "#/components/schemas/Settings/additionalProperties/properties/mode";

    const output = await generate(documentWith({ Settings: SETTINGS, Ref: { $ref: ref } }));

    expect(output).toContain("Ref: SettingsMode_2;");
    expect(output).not.toContain("SettingsMode_3");
  });

  it("openapiTS types a discriminated union's own enum alike from a tuple element's allOf", async () => {
    const union = {
      type: "object",
      discriminator: { propertyName: "type" },
      properties: { type: { type: "string" }, size: { enum: ["s", "m"] } },
      oneOf: [{ $ref: "#/components/schemas/Cat" }],
    };
    const cat = { allOf: [{ $ref: "#/components/schemas/Pet" }] };
    const tuple = { type: "array", prefixItems: [cat] };

    const output = await generate(documentWith({ Pet: union, Cat: cat, Tup: tuple }));

    expect(enumsNamed(output, "PetSize")).toEqual(["export enum PetSize "]);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types the union's own enum at the union's location for a tuple member", async () => {
    const union = {
      type: "object",
      discriminator: { propertyName: "type" },
      properties: { type: { type: "string" }, size: { enum: ["s", "m"] } },
      oneOf: [{ $ref: "#/components/schemas/Tup" }],
    };
    const tuple = { type: "array", prefixItems: [{ allOf: [{ $ref: "#/components/schemas/Pet" }] }] };

    const output = await generate(documentWith({ Tup: tuple, Pet: union }));

    expect(enumsNamed(output, "PetSize")).toEqual(["export enum PetSize "]);
    expect(output).not.toMatch(/export enum Tup/);
  });

  it("openapiTS keeps the union's record values at a shared location for a tuple member", async () => {
    const union = {
      type: "object",
      discriminator: { propertyName: "type" },
      properties: { type: { type: "string" }, mode: { enum: ["a"] } },
      additionalProperties: modeOf(["b"]),
      oneOf: [{ $ref: "#/components/schemas/Tup" }],
    };
    const tuple = { type: "array", prefixItems: [{ allOf: [{ $ref: "#/components/schemas/Pet" }] }] };

    const output = await generate(documentWith({ Tup: tuple, Pet: union }));

    expect(enumsNamed(output, "PetMode")).toEqual(["export enum PetMode ", "export enum PetMode_2 "]);
  });
});

describe("--enum names of tuple elements at one location and position", () => {
  const nested = {
    type: "array",
    prefixItems: [{ type: "array", prefixItems: [{ enum: ["a"] }, { enum: ["b"] }] }, { enum: ["c"] }],
  };
  const inAllOf = {
    allOf: [
      { type: "array", prefixItems: [{ enum: ["a"] }] },
      { type: "array", prefixItems: [{ enum: ["b"] }] },
    ],
  };

  it("openapiTS names a nested tuple in the document's order whatever a $ref meets first", async () => {
    const ref = "#/components/schemas/Tup/prefixItems/1";
    const withRef = await generate(documentWith({ AAA: { $ref: ref }, Tup: nested }));
    const withoutRef = await generate(documentWith({ Tup: nested }));

    expect(withRef).toContain('export enum Tup_3 {\n    c = "c"');
    expect(withoutRef).toContain('export enum Tup_3 {\n    c = "c"');
  });

  it("openapiTS gives the intersected elements of allOf tuples one enum whatever a $ref meets first", async () => {
    const ref = "#/components/schemas/Tup/allOf/1/prefixItems/0";
    const withRef = await generate(documentWith({ AAA: { $ref: ref }, Tup: inAllOf }));
    const withoutRef = await generate(documentWith({ Tup: inAllOf }));

    for (const output of [withRef, withoutRef]) {
      expect(output).toMatch(/Tup: \[\n\s+Tup\.a\n\s+\] & \[\n\s+Tup\.b\n\s+\];/);
      expect(enumsNamed(output, "Tup")).toEqual(["export enum Tup "]);
    }
  });

  it("openapiTS with --enum-values names a nested tuple's arrays in the document's order", async () => {
    const ref = "#/components/schemas/Tup/prefixItems/1";
    const options = { enumValues: true } as OpenAPITSOptions;

    const output = await generate(documentWith({ AAA: { $ref: ref }, Tup: nested }), options);

    expect(output).toContain('export const tupValues_3: ReadonlyArray<"c"> = ["c"];');
  });
});
