import { describe, expect, it } from "vitest";
import {
  componentKeysOf,
  renameQueryNamedComponents,
} from "../../../src/adapters/redocly-loader/query-named-components.js";

const PET_URL = "https://host/schemas/pet?token=SECRET";
const PET_NAME = "pet?token=SECRET";

/** A document before bundling and the keys it had; the test then adds what the bundle adds. */
function documentWithSchemas(schemas: Record<string, unknown>) {
  const document = { components: { schemas: { ...schemas } as Record<string, unknown> } };
  return { document, keysBefore: componentKeysOf(document) };
}

describe("renameQueryNamedComponents", () => {
  it("renames a component named after a URL with a query and every $ref and mapping to it", () => {
    const { document, keysBefore } = documentWithSchemas({ Owner: { type: "object" } });
    const schemas = document.components.schemas;
    schemas[PET_NAME] = { type: "object" };
    schemas.Pets = {
      oneOf: [{ $ref: `#/components/schemas/${PET_NAME}` }],
      discriminator: { propertyName: "kind", mapping: { pet: `#/components/schemas/${PET_NAME}` } },
    };

    renameQueryNamedComponents(document, keysBefore, [PET_URL]);

    expect(Object.keys(schemas)).toEqual(["Owner", "pet", "Pets"]);
    expect(schemas.Pets).toEqual({
      oneOf: [{ $ref: "#/components/schemas/pet" }],
      discriminator: { propertyName: "kind", mapping: { pet: "#/components/schemas/pet" } },
    });
  });

  it("keeps the rest of a name Redocly built from the base name and a pointer or a serial", () => {
    const { document, keysBefore } = documentWithSchemas({});
    const schemas = document.components.schemas;
    schemas[`${PET_NAME}_Tag`] = { type: "string" };
    schemas[`${PET_NAME}-2`] = { type: "string" };

    renameQueryNamedComponents(document, keysBefore, [PET_URL]);

    expect(Object.keys(schemas)).toEqual(["pet_Tag", "pet-2"]);
  });

  it("gives the new name a serial when the document has that name already", () => {
    const { document, keysBefore } = documentWithSchemas({ pet: { type: "integer" } });
    document.components.schemas[PET_NAME] = { type: "object" };

    const renaming = renameQueryNamedComponents(document, keysBefore, [PET_URL]);

    expect(Object.keys(document.components.schemas)).toEqual(["pet", "pet-2"]);
    expect(renaming.pointer(`#/components/schemas/${PET_NAME}/properties/a`)).toBe(
      "#/components/schemas/pet-2/properties/a",
    );
    expect(renaming.text(`Renamed ${PET_NAME} to x`)).toBe("Renamed pet-2 to x");
  });

  it("keeps the keys the document had, also when they look like a URL base name", () => {
    const { document, keysBefore } = documentWithSchemas({ [PET_NAME]: { type: "object" } });

    renameQueryNamedComponents(document, keysBefore, [PET_URL]);

    expect(Object.keys(document.components.schemas)).toEqual([PET_NAME]);
  });

  it("names a URL without a last path segment after its host", () => {
    const { document, keysBefore } = documentWithSchemas({});
    document.components.schemas["?key=SECRET"] = { type: "object" };

    renameQueryNamedComponents(document, keysBefore, ["https://example.com/?key=SECRET"]);

    expect(Object.keys(document.components.schemas)).toEqual(["example.com"]);
  });

  it("leaves names alone for files, URLs without a query, and queries Redocly drops already", () => {
    const { document, keysBefore } = documentWithSchemas({});
    document.components.schemas.pet = { type: "object" };
    const refs = ["/work/pet.yaml", "https://host/pet", "https://host/pet.yaml?token=SECRET"];

    const renaming = renameQueryNamedComponents(document, keysBefore, refs);

    expect(Object.keys(document.components.schemas)).toEqual(["pet"]);
    expect(renaming.pointer("#/components/schemas/pet")).toBe("#/components/schemas/pet");
    expect(renaming.text("at pet")).toBe("at pet");
  });

  it("matches the longest base name when one starts another", () => {
    const { document, keysBefore } = documentWithSchemas({});
    document.components.schemas["pet?a_b"] = {};
    // `pet?a_b` is the whole base name of the second URL, not `pet?a` with the pointer `b`.
    const refs = ["https://host/pet?a", "https://host/pet?a_b"];

    renameQueryNamedComponents(document, keysBefore, refs);

    expect(Object.keys(document.components.schemas)).toEqual(["pet"]);
  });
});
