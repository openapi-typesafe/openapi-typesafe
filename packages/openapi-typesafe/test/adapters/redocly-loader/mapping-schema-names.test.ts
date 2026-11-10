import { describe, expect, it } from "vitest";
import { pointMappingNamesAtSchemas } from "../../../src/adapters/redocly-loader/mapping-schema-names.js";

function documentWith(
  mapping: Record<string, unknown>,
  schemas: Record<string, unknown> | null = {},
) {
  const pet = { oneOf: [], discriminator: { propertyName: "kind", mapping } };
  return { components: schemas === null ? {} : { schemas: { Pet: pet, ...schemas } }, pet };
}

describe("pointMappingNamesAtSchemas", () => {
  it("pointMappingNamesAtSchemas points a schema name at the schema", () => {
    const { components, pet } = documentWith({ cat: "Cat" }, { Cat: {} });

    pointMappingNamesAtSchemas({ components });

    expect(pet.discriminator.mapping).toEqual({ cat: "#/components/schemas/Cat" });
  });

  it("pointMappingNamesAtSchemas escapes the name in the pointer", () => {
    const { components, pet } = documentWith({ cat: "a/b~c#" }, { "a/b~c#": {} });

    pointMappingNamesAtSchemas({ components });

    expect(pet.discriminator.mapping).toEqual({ cat: "#/components/schemas/a~1b~0c%23" });
  });

  it("pointMappingNamesAtSchemas keeps URI references and names of no schema", () => {
    const mapping = { a: "#/components/schemas/Cat", b: "./Cat", c: "Dog", d: "dog.yaml", e: 1 };
    const { components, pet } = documentWith({ ...mapping }, { Cat: {} });

    pointMappingNamesAtSchemas({ components });

    expect(pet.discriminator.mapping).toEqual(mapping);
  });

  it("pointMappingNamesAtSchemas reads only own schema keys", () => {
    const { components, pet } = documentWith({ a: "toString" });

    pointMappingNamesAtSchemas({ components });

    expect(pet.discriminator.mapping).toEqual({ a: "toString" });
  });

  it("pointMappingNamesAtSchemas without components.schemas changes nothing", () => {
    const { pet } = documentWith({ cat: "Cat" }, null);
    const document = {
      paths: { "/": { get: { responses: { 200: { content: { "a/b": { schema: pet } } } } } } },
    };

    pointMappingNamesAtSchemas(document);

    expect(pet.discriminator.mapping).toEqual({ cat: "Cat" });
  });
});
