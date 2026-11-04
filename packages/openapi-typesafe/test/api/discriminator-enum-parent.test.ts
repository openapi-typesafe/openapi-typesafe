import { describe, expect, it } from "vitest";
import { enumParentOf } from "../../src/api/discriminator-enum-parent.js";
import type { DiscriminatorObject } from "../../src/types.js";

const KIND = { type: "string", enum: ["cat", "dog"] };
const DISCRIMINATOR: DiscriminatorObject = { propertyName: "kind" };

/** An in-memory document: `$ref` → schema. */
function resolverOf(schemas: Record<string, unknown>) {
  return (ref: string) => schemas[ref];
}

function patchOf(owner: string) {
  return { ref: "#/components/schemas/Cat", values: ["cat"], discriminator: DISCRIMINATOR, discriminatorRef: owner };
}

describe("enumParentOf", () => {
  it("enumParentOf finds an inline enum of the owner, typed at the owner's property", () => {
    const resolve = resolverOf({ "#/components/schemas/Pet": { properties: { kind: KIND } } });

    expect(enumParentOf(patchOf("#/components/schemas/Pet"), resolve)).toEqual({
      schema: KIND,
      path: "#/components/schemas/Pet/kind",
    });
  });

  it("enumParentOf follows a $ref, typed where the transformer types it", () => {
    const target = "#/components/schemas/Shared/properties/kind";
    const resolve = resolverOf({
      "#/components/schemas/Pet": { allOf: [{ properties: { kind: { $ref: target } } }] },
      [target]: KIND,
    });

    expect(enumParentOf(patchOf("#/components/schemas/Pet"), resolve)).toEqual({
      schema: KIND,
      path: "#/components/schemas/Shared/kind",
    });
  });

  it("enumParentOf ends on an allOf cycle and finds nothing without an enum", () => {
    const resolve = resolverOf({
      A: { allOf: [{ $ref: "B" }, true] },
      B: { allOf: [{ $ref: "A" }] },
      Plain: { properties: { kind: { type: "string" } } },
      Missing: { properties: { kind: { $ref: "Nowhere" } } },
    });

    expect(enumParentOf(patchOf("A"), resolve)).toBeUndefined();
    expect(enumParentOf(patchOf("Plain"), resolve)).toBeUndefined();
    expect(enumParentOf(patchOf("Missing"), resolve)).toBeUndefined();
    expect(enumParentOf(patchOf("Nowhere"), resolve)).toBeUndefined();
  });
});
