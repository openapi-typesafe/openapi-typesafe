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

/** A loaded document whose parsed root is `parsed`, as the bundle keeps it for its components. */
const loaded = (source: string, parsed: unknown) => ({ source, parsed });

describe("renameQueryNamedComponents", () => {
  it("renames a component named after a URL with a query and every $ref and mapping to it", () => {
    const { document, keysBefore } = documentWithSchemas({ Owner: { type: "object" } });
    const schemas = document.components.schemas;
    const pet = { type: "object" };
    schemas[PET_NAME] = pet;
    schemas.Pets = {
      oneOf: [{ $ref: `#/components/schemas/${PET_NAME}` }],
      discriminator: { propertyName: "kind", mapping: { pet: `#/components/schemas/${PET_NAME}` } },
    };

    renameQueryNamedComponents(document, keysBefore, [loaded(PET_URL, pet)]);

    expect(Object.keys(schemas)).toEqual(["Owner", "pet", "Pets"]);
    expect(schemas.Pets).toEqual({
      oneOf: [{ $ref: "#/components/schemas/pet" }],
      discriminator: { propertyName: "kind", mapping: { pet: "#/components/schemas/pet" } },
    });
  });

  it("keeps the rest of a name Redocly built from the base name and a pointer", () => {
    const { document, keysBefore } = documentWithSchemas({});
    const tag = { type: "string" };
    document.components.schemas[`${PET_NAME}_Tag`] = tag;

    renameQueryNamedComponents(document, keysBefore, [loaded(PET_URL, { Tag: tag })]);

    expect(Object.keys(document.components.schemas)).toEqual(["pet_Tag"]);
  });

  it("chooses the serial again for documents that took one name only through the query", () => {
    const { document, keysBefore } = documentWithSchemas({});
    const [first, second] = [{ type: "string" }, { type: "integer" }];
    document.components.schemas[PET_NAME] = first;
    document.components.schemas[`${PET_NAME}-2`] = second;
    const documents = [
      loaded(PET_URL, first),
      loaded("https://host/other/pet?token=SECRET", second),
    ];

    renameQueryNamedComponents(document, keysBefore, documents);

    expect(Object.keys(document.components.schemas)).toEqual(["pet", "pet-2"]);
  });

  // GitHub's contents API takes the branch as `?ref=feature/new-api`: Redocly names both
  // documents after `new-api`, the text behind the last `/` of the whole URL.
  it("names each document after its own path when the query has a slash", () => {
    const { document, keysBefore } = documentWithSchemas({});
    const [pet, owner] = [{ type: "object" }, { type: "string" }];
    document.components.schemas["new-api"] = pet;
    document.components.schemas["new-api-2"] = owner;
    const documents = [
      loaded("https://host/repo/pet.json?ref=feature/new-api", pet),
      loaded("https://host/repo/owner.yaml?ref=feature/new-api", owner),
    ];

    renameQueryNamedComponents(document, keysBefore, documents);

    expect(document.components.schemas).toEqual({ pet, owner });
  });

  it("gives the new name a serial when the document has that name already", () => {
    const { document, keysBefore } = documentWithSchemas({ pet: { type: "integer" } });
    const pet = { type: "object" };
    document.components.schemas[PET_NAME] = pet;

    const renaming = renameQueryNamedComponents(document, keysBefore, [loaded(PET_URL, pet)]);

    expect(Object.keys(document.components.schemas)).toEqual(["pet", "pet-2"]);
    expect(renaming.pointer(`#/components/schemas/${PET_NAME}/properties/a`)).toBe(
      "#/components/schemas/pet-2/properties/a",
    );
    expect(renaming.text(`Renamed ${PET_NAME} to x`)).toBe("Renamed pet-2 to x");
  });

  it("keeps the keys the document had, also when they look like a URL base name", () => {
    const pet = { type: "object" };
    const { document, keysBefore } = documentWithSchemas({ [PET_NAME]: pet });

    renameQueryNamedComponents(document, keysBefore, [loaded(PET_URL, pet)]);

    expect(Object.keys(document.components.schemas)).toEqual([PET_NAME]);
  });

  it("keeps a component whose node is in no document with a query", () => {
    const { document, keysBefore } = documentWithSchemas({});
    document.components.schemas[PET_NAME] = { type: "object" };

    renameQueryNamedComponents(document, keysBefore, [loaded(PET_URL, { type: "object" })]);

    expect(Object.keys(document.components.schemas)).toEqual([PET_NAME]);
  });

  it("names a URL without a last path segment after its host", () => {
    const { document, keysBefore } = documentWithSchemas({});
    const node = { type: "object" };
    document.components.schemas["?key=SECRET"] = node;

    renameQueryNamedComponents(document, keysBefore, [
      loaded("https://example.com/?key=SECRET", node),
    ]);

    expect(Object.keys(document.components.schemas)).toEqual(["example.com"]);
  });

  it("leaves names alone for files, URLs without a query, and queries Redocly drops already", () => {
    const { document, keysBefore } = documentWithSchemas({});
    const pet = { type: "object" };
    document.components.schemas.pet = pet;
    const refs = ["/work/pet.yaml", "https://host/pet", "https://host/pet.yaml?token=SECRET"];

    const renaming = renameQueryNamedComponents(
      document,
      keysBefore,
      refs.map((ref) => loaded(ref, pet)),
    );

    expect(Object.keys(document.components.schemas)).toEqual(["pet"]);
    expect(renaming.pointer("#/components/schemas/pet")).toBe("#/components/schemas/pet");
    expect(renaming.text("at pet")).toBe("at pet");
  });

  it.each([
    ["https://host/pet.yaml?token=SECRET", "pet-3"],
    ["https://example.com/", ""],
  ])("keeps the name and serial of a component of %s, whose name has no query", (url, key) => {
    const { document, keysBefore } = documentWithSchemas({});
    const node = { type: "object" };
    document.components.schemas[key] = node;

    renameQueryNamedComponents(document, keysBefore, [loaded(url, node)]);

    expect(Object.keys(document.components.schemas)).toEqual([key]);
  });

  it("names a component after its own document when one base name starts another", () => {
    const { document, keysBefore } = documentWithSchemas({});
    const node = {};
    document.components.schemas["pet?a_b"] = node;
    // `pet?a_b` is the whole base name of the second URL, not `pet?a` with the pointer `b`.
    const documents = [loaded("https://host/pet?a", {}), loaded("https://host/pet?a_b", node)];

    renameQueryNamedComponents(document, keysBefore, documents);

    expect(Object.keys(document.components.schemas)).toEqual(["pet"]);
  });
});

describe("ComponentRenaming isResolvedCollision", () => {
  const collision = (first: string, second: string) =>
    `Two schemas are referenced with the same name but different content. Renamed ${first} to ${second}.`;

  /** The renaming of two documents that Redocly gave one name, `name` and `name-2`. */
  function renamingOf(name: string, firstUrl: string, secondUrl: string) {
    const { document, keysBefore } = documentWithSchemas({});
    const [first, second] = [{ type: "string" }, { type: "integer" }];
    document.components.schemas[name] = first;
    document.components.schemas[`${name}-2`] = second;
    return renameQueryNamedComponents(document, keysBefore, [
      loaded(firstUrl, first),
      loaded(secondUrl, second),
    ]);
  }

  it("isResolvedCollision is true when the new names no longer share a name", () => {
    const renaming = renamingOf(
      "new-api",
      "https://h/pet.json?ref=a/new-api",
      "https://h/owner.json?ref=a/new-api",
    );

    expect(renaming.isResolvedCollision(collision("new-api", "new-api-2"))).toBe(true);
  });

  it("isResolvedCollision is true when one new name only starts the other", () => {
    const renaming = renamingOf(
      "new-api",
      "https://h/pet.json?ref=a/new-api",
      "https://h/petshop.json?ref=a/new-api",
    );

    expect(renaming.isResolvedCollision(collision("new-api", "new-api-2"))).toBe(true);
  });

  it("isResolvedCollision is false when the new names still share a name", () => {
    const renaming = renamingOf(PET_NAME, PET_URL, "https://host/other/pet?token=SECRET");

    expect(renaming.isResolvedCollision(collision(PET_NAME, `${PET_NAME}-2`))).toBe(false);
  });

  it("isResolvedCollision is false for a collision of names no query made", () => {
    const { document, keysBefore } = documentWithSchemas({});

    const renaming = renameQueryNamedComponents(document, keysBefore, []);

    expect(renaming.isResolvedCollision(collision("pet", "pet-2"))).toBe(false);
    expect(renaming.isResolvedCollision("Renamed pet to owner.")).toBe(false);
  });
});
