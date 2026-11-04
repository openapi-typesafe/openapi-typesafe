import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `discriminator-enum-members` fix (ADR-024, upstream #1700). */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const MAPPING = { Dog: ref("Dog").$ref, Cat: ref("Cat").$ref, "hot-dog": ref("HotDog").$ref, "+": ref("Plus").$ref };
const VALUES = ["Dog", "Cat", "Lizard", "hot-dog", "+"];
/** `hot-dog` is the member `hot_dog`; `+` can only be a quoted member, `"+"`. */
const PET_TYPES = ["PetType.Cat", "PetType.Dog", "PetType.hot_dog", 'typeof PetType["+"]'];

function pet(petType: Record<string, unknown>) {
  return {
    type: "object",
    required: ["petType"],
    properties: { petType },
    discriminator: { propertyName: "petType", mapping: MAPPING },
  };
}

function member(properties: Record<string, unknown>, parent = "Pet") {
  return { allOf: [ref(parent), { type: "object", properties }] };
}

/** Upstream #1700: the parent's discriminator property is the enum `PetType`. */
const SCHEMAS = {
  PetType: { type: "string", enum: VALUES },
  Pet: pet(ref("PetType")),
  Cat: member({ name: { type: "string" } }),
  Dog: member({ bark: { type: "string" } }),
  HotDog: member({ mustard: { type: "boolean" } }),
  Plus: member({ sign: { type: "boolean" } }),
};

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.0.1", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  const run = { silent: true, enum: true, ...options };
  return astToString(await openapiTS(documentWith(structuredClone(schemas)), run));
}

async function fixed(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return generate(schemas, { fix: ["discriminator-enum-members"], ...options });
}

/** The types of the `petType` properties the scan added, in order; the owner's own comes first. */
function petTypesOf(output: string): string[] {
  return [...output.matchAll(/^ {12}petType: ([^;]+);$/gm)].map((match) => match[1] ?? "").slice(1);
}

describe("discriminator-enum-members fix", () => {
  it("openapiTS without the fix declares an enum per member", async () => {
    const output = await generate(SCHEMAS);

    expect(petTypesOf(output)).toEqual(["CatPetType", "DogPetType", "HotDogPetType", "PlusPetType"]);
  });

  it("openapiTS with the fix uses the members of the parent's enum", async () => {
    const output = await fixed(SCHEMAS);

    expect(petTypesOf(output)).toEqual(PET_TYPES);
    expect(output).not.toContain("enum CatPetType");
  });

  it("openapiTS with the fix gives types that the parent's enum accepts and narrows by", async () => {
    const code = `${await fixed(SCHEMAS)}
const cat: components["schemas"]["Cat"] = { petType: PetType.Cat, name: "Tom" };
const pet: components["schemas"]["Pet"] = cat;
const hotDog: components["schemas"]["HotDog"] = { petType: PetType.hot_dog };
const plus: components["schemas"]["Plus"] = { petType: PetType["+"] };
export function nameOf(animal: components["schemas"]["Cat"] | components["schemas"]["Dog"]) {
  return animal.petType === PetType.Cat ? animal.name : animal.bark;
}
// @ts-expect-error another member
const dog: components["schemas"]["Cat"] = { petType: PetType.Dog };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS with the fix uses an inline enum of the parent", async () => {
    const schemas = { ...SCHEMAS, Pet: pet({ type: "string", enum: VALUES }) };

    expect(petTypesOf(await fixed(schemas))).toEqual(PET_TYPES.map((type) => type.replace("PetType", "PetPetType")));
  });

  it("openapiTS with the fix finds the property in the parent's own parent", async () => {
    const schemas = {
      Base: { type: "object", required: ["petType"], properties: { petType: ref("PetType") } },
      ...SCHEMAS,
      Pet: { ...pet(ref("PetType")), properties: {}, allOf: [ref("Base")] },
    };

    expect(petTypesOf(await fixed(schemas))).toEqual(PET_TYPES);
  });

  it("openapiTS with the fix uses the names of x-enum-varnames", async () => {
    const named = { ...SCHEMAS.PetType, "x-enum-varnames": ["DOG", "CAT", "LIZARD", "HOT_DOG", "PLUS"] };

    const output = await fixed({ ...SCHEMAS, PetType: named });

    expect(petTypesOf(output)).toEqual(["PetType.CAT", "PetType.DOG", "PetType.HOT_DOG", "PetType.PLUS"]);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with the fix and --dedupe-enums uses the enum declared first", async () => {
    const output = await fixed({ Kind: SCHEMAS.PetType, ...SCHEMAS }, { dedupeEnums: true });

    expect(petTypesOf(output)).toEqual(PET_TYPES.map((type) => type.replace("PetType", "Kind")));
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS with the fix keeps the member enum where the parent's enum lacks a value", async () => {
    const schemas = { ...SCHEMAS, PetType: { type: "string", enum: ["Dog", "Cat"] } };

    expect(petTypesOf(await fixed(schemas))).toEqual(["PetType.Cat", "PetType.Dog", "HotDogPetType", "PlusPetType"]);
  });

  it("openapiTS with the fix changes nothing where the parent's property is no enum", async () => {
    const schemas = { ...SCHEMAS, Pet: pet({ type: "string" }) };

    expect(await fixed(schemas)).toBe(await generate(schemas));
  });

  it("openapiTS with the fix changes nothing without --enum", async () => {
    expect(await fixed(SCHEMAS, { enum: false })).toBe(await generate(SCHEMAS, { enum: false }));
  });
});
