import { describe, expect, it } from "vitest";
import { type OpenAPI3, resolveRef, scanDiscriminators, walk } from "../../src/index.js";

/** The deprecated exports keep working in 1.x (ADR-004, decision 9). */

const ALIAS_REF = "#/components/schemas/Alias";

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: {
    schemas: {
      Pet: { type: "object", discriminator: { propertyName: "kind" } },
      Alias: { type: "object", allOf: [{ $ref: "#/components/schemas/Pet" }] },
    },
  },
};

describe("deprecated utilities", () => {
  it("walk visits every object with its path, from the given start path", () => {
    const paths: string[] = [];

    walk({ a: { b: {} } }, (_value, path) => paths.push(path.join("/")), ["root"]);

    expect(paths).toEqual(["root", "root/a", "root/a/b"]);
  });

  it("resolveRef follows a $ref chain", () => {
    const document = { a: { $ref: "#/b" }, b: { type: "string" } };

    expect(resolveRef(document, "#/a", { silent: true })).toEqual({ type: "string" });
  });

  it("scanDiscriminators finds the discriminators", () => {
    const { objects } = scanDiscriminators(structuredClone(DOCUMENT), { silent: true });

    expect(Object.keys(objects)).toEqual(["#/components/schemas/Pet", "#/components/schemas/Alias"]);
  });

  it("scanDiscriminators keeps both values when two discriminators give a schema different ones", () => {
    const document = structuredClone(DOCUMENT);
    const schemas = document.components?.schemas ?? {};
    schemas.Pet = { type: "object", discriminator: { propertyName: "kind", mapping: { alias: ALIAS_REF } } };
    schemas.Shelter = { type: "object", oneOf: [{ $ref: ALIAS_REF }], discriminator: { propertyName: "kind" } };

    scanDiscriminators(document, { silent: true });

    const added = (schemas.Alias as { allOf: { properties?: { kind?: { enum?: string[] } } }[] }).allOf;
    expect(added.map((item) => item.properties?.kind?.enum)).toEqual([undefined, ["Alias"], ["alias"]]);
  });
});
