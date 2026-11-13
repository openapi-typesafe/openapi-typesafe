import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `$ref`s into a property of a schema whose own `properties` sit next to `anyOf` or `oneOf`
 * variants: the original pointer does not compile, so it is typed by default (ADR-026).
 */

const OWNER = { type: "object", properties: { name: { type: "string" } } };
const OWN = { owner: OWNER, tags: { type: "array", items: { type: "string" } } };
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const SCHEMAS = {
  OnePet: {
    type: "object",
    required: ["petType"],
    properties: { petType: { type: "string" }, ...OWN },
    oneOf: [ref("Cat"), ref("Dog")],
    discriminator: { propertyName: "petType" },
  },
  AnyPet: { type: "object", properties: OWN, anyOf: [ref("Cat"), ref("Dog")] },
  PrimitivePet: { type: "object", properties: OWN, oneOf: [{ type: "string" }, { type: "number" }] },
  SharedPet: { type: "object", properties: OWN, oneOf: [ref("Owned")] },
  RequiredPet: { type: "object", properties: OWN, anyOf: [{ required: ["owner"] }] },
  OneRequiredPet: {
    type: "object",
    properties: { ...OWN, email: { type: "string" }, phone: { type: "string" } },
    oneOf: [{ required: ["email"] }, { required: ["phone"] }],
  },
  ObjectRequiredPet: {
    type: "object",
    properties: OWN,
    oneOf: [
      { type: "object", required: ["email"] },
      { type: "object", required: ["phone"] },
    ],
  },
  TitledPet: {
    type: "object",
    properties: OWN,
    oneOf: [
      { type: "object", title: "A" },
      { type: "object", title: "B" },
    ],
  },
  Cat: { type: "object", properties: { meow: { type: "boolean" } } },
  Dog: { type: "object", properties: { bark: { type: "boolean" } } },
  Owned: { type: "object", properties: { owner: OWNER } },
};
const NAMES = [
  "OnePet",
  "AnyPet",
  "PrimitivePet",
  "SharedPet",
  "RequiredPet",
  "OneRequiredPet",
  "ObjectRequiredPet",
  "TitledPet",
];
const VARIANT_SHAPES = ["OneRequiredPet", "ObjectRequiredPet", "TitledPet"];
const readThrough = (name: string) => `${name}?: NonNullable<components["schemas"]["${name}"]["owner"]>["name"];`;
const ownerName = (name: string) => ref(`${name}/properties/owner/properties/name`);
const USE = {
  type: "object",
  properties: {
    ...Object.fromEntries(NAMES.map((name) => [name, ownerName(name)])),
    tag: ref("OnePet/properties/tags/items"),
  },
};

async function generate(options: OpenAPITSOptions = {}): Promise<string> {
  const document = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas: { ...SCHEMAS, Use: USE } },
  } as unknown as OpenAPI3;
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

describe("$refs into properties next to anyOf and oneOf", () => {
  it("openapiTS reads through the properties next to oneOf variants", async () => {
    const output = await generate();

    expect(output).toContain('OnePet?: NonNullable<components["schemas"]["OnePet"]["owner"]>["name"];');
    expect(output).toContain('tag?: NonNullable<components["schemas"]["OnePet"]["tags"]>[number];');
  });

  it("openapiTS reads through a property that a oneOf variant declares too", async () => {
    const output = await generate();

    expect(output).toContain('SharedPet?: NonNullable<components["schemas"]["SharedPet"]["owner"]>["name"];');
  });

  it("openapiTS types the target in place where a union variant misses the property", async () => {
    const output = await generate();

    expect(output).toContain("AnyPet?: string;");
    expect(output).toContain("PrimitivePet?: string;");
    expect(output).toContain("RequiredPet?: string;");
  });

  it.each([[{}], [{ fix: ["anyof-oneof-required"] }], [{ emptyObjectsUnknown: true }]] as const)(
    "openapiTS %j reads through properties next to untyped variants",
    async (options) => {
      const output = await generate({ ...options, fix: "fix" in options ? [...options.fix] : [] });

      for (const name of VARIANT_SHAPES) {
        expect(output).toContain(readThrough(name));
      }
    },
  );

  it("openapiTS with anyof-oneof-required keeps a property every variant requires", async () => {
    const output = await generate({ fix: ["anyof-oneof-required"] });

    expect(output).toContain('RequiredPet?: components["schemas"]["RequiredPet"]["owner"]["name"];');
  });

  it("openapiTS with anyof-properties reads through the properties next to anyOf", async () => {
    const output = await generate({ fix: ["anyof-properties"] });

    expect(output).toContain('AnyPet?: NonNullable<components["schemas"]["AnyPet"]["owner"]>["name"];');
  });

  it.each([[[]], [["anyof-properties"]], [["anyof-oneof-required"]], [["ref-pointers"]]] as const)(
    "openapiTS with fix %j writes output that compiles",
    async (fix) => {
      expect(typeErrorsOf(await generate({ fix: [...fix] }))).toEqual([]);
    },
  );

  it("openapiTS with --empty-objects-unknown writes output that compiles", async () => {
    expect(typeErrorsOf(await generate({ emptyObjectsUnknown: true }))).toEqual([]);
  });
});
