import { describe, expect, it } from "vitest";
import {
  removeBundledMappingCopies,
  schemaKeysOf,
} from "../../../src/adapters/redocly-loader/bundled-mapping-copies.js";

/** A bundled document as Redocly 1.x leaves it: `a~0b` is the same object as `a~b`. */
function bundledWithCopy() {
  const original = { type: "object" };
  const document = {
    components: {
      schemas: {
        "a~b": original,
        Pet: {
          oneOf: [{ $ref: "#/components/schemas/a~0b" }],
          discriminator: { propertyName: "kind", mapping: { tilde: "#/components/schemas/a~0b" } },
        },
      } as Record<string, unknown>,
    },
  };
  const keysBefore = schemaKeysOf(document);
  document.components.schemas["a~0b"] = original;
  return { document, keysBefore };
}

describe("removeBundledMappingCopies", () => {
  it("removeBundledMappingCopies removes a copy the bundle added and points the mapping at the original", () => {
    const { document, keysBefore } = bundledWithCopy();

    removeBundledMappingCopies(document, keysBefore);

    expect(Object.keys(document.components.schemas)).toEqual(["a~b", "Pet"]);
    expect(document.components.schemas.Pet).toMatchObject({
      oneOf: [{ $ref: "#/components/schemas/a~0b" }],
      discriminator: { mapping: { tilde: "#/components/schemas/a~0b" } },
    });
  });

  it("removeBundledMappingCopies keeps keys the document had, also when they share one object", () => {
    const shared = { type: "string" };
    const document = { components: { schemas: { A: shared, B: shared } } };

    removeBundledMappingCopies(document, schemaKeysOf(document));

    expect(Object.keys(document.components.schemas)).toEqual(["A", "B"]);
  });

  it("removeBundledMappingCopies keeps a schema the bundle added from another document", () => {
    const document = {
      components: { schemas: { A: { type: "string" } } as Record<string, unknown> },
    };
    const keysBefore = schemaKeysOf(document);
    document.components.schemas.External = { type: "string" };

    removeBundledMappingCopies(document, keysBefore);

    expect(Object.keys(document.components.schemas)).toEqual(["A", "External"]);
  });

  it("removeBundledMappingCopies leaves a document without schemas as it is", () => {
    const document = { paths: {} };

    removeBundledMappingCopies(document, schemaKeysOf(document));

    expect(document).toEqual({ paths: {} });
    expect(schemaKeysOf(null)).toEqual(new Set());
  });
});
