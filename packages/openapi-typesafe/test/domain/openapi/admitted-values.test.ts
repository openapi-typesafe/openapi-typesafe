import { describe, expect, it } from "vitest";
import {
  admittedPropertyValues,
  resolveLocalRef,
} from "../../../src/domain/openapi/admitted-values.js";
import { findDiscriminatorValueConflicts } from "../../../src/domain/openapi/discriminator-conflicts.js";

/** The finite values a schema property admits, read from the document (ADR-027). */

const document = {
  components: {
    schemas: {
      Kind: { enum: ["a", "b", "c"] },
      Self: { allOf: [{ $ref: "#/components/schemas/Self" }], properties: { k: { const: "x" } } },
    },
  },
  list: [{ value: 1 }],
};

function valuesOf(property: unknown, extra: Record<string, unknown> = {}) {
  const schema = { properties: { k: property }, ...extra };
  const values = admittedPropertyValues(schema, "k", document);
  return values === null ? null : [...values];
}

describe("admittedPropertyValues", () => {
  it("admittedPropertyValues intersects enums and const over allOf", () => {
    const allOf = [{ properties: { k: { enum: ["b", "c", "d"] } } }];

    expect(valuesOf({ $ref: "#/components/schemas/Kind" }, { allOf })).toEqual(["b", "c"]);
    expect(valuesOf({ enum: ["a", "b"], const: "b" })).toEqual(["b"]);
  });

  it("admittedPropertyValues unites anyOf and oneOf variants", () => {
    expect(valuesOf({ anyOf: [{ const: "a" }], oneOf: [{ enum: [1, null] }] })).toEqual([
      "a",
      1,
      null,
    ]);
    expect(valuesOf({ anyOf: [{ const: "a" }, { type: "string" }] })).toBeNull();
  });

  it("admittedPropertyValues admits every value where it cannot read the schema", () => {
    expect(valuesOf({ type: "string" })).toBeNull();
    expect(valuesOf({ $ref: "other.json#/Kind" })).toBeNull();
    expect(valuesOf(true)).toBeNull();
    expect(admittedPropertyValues({ $ref: "#/components/schemas/Self" }, "k", document)).toEqual(
      new Set(["x"]),
    );
  });

  it("admittedPropertyValues leaves out skipped references", () => {
    const schema = { allOf: [{ $ref: "#/components/schemas/Self" }] };
    const skipped = new Set(["#/components/schemas/Self"]);

    expect(admittedPropertyValues(schema, "k", document, skipped)).toBeNull();
  });
});

describe("resolveLocalRef", () => {
  it("resolveLocalRef follows objects and arrays and nothing else", () => {
    expect(resolveLocalRef(document, "#/list/0/value")).toBe(1);
    expect(resolveLocalRef(document, "#/list/0/value/deeper")).toBeUndefined();
    expect(resolveLocalRef(document, "other.json#/list")).toBeUndefined();
  });
});

describe("findDiscriminatorValueConflicts", () => {
  it("findDiscriminatorValueConflicts reads bare mapping names and needs no components", () => {
    const mapped = {
      components: {
        schemas: {
          Pet: {
            discriminator: { propertyName: "kind", mapping: { dog: "Dog" } },
            oneOf: [{ $ref: "#/components/schemas/Dog" }],
          },
          Dog: { properties: { kind: { const: "cat" } } },
        },
      },
    };

    expect(findDiscriminatorValueConflicts(mapped).map((conflict) => conflict.values)).toEqual([
      ["dog"],
    ]);
    expect(findDiscriminatorValueConflicts({ paths: {} })).toEqual([]);
  });

  it("findDiscriminatorValueConflicts skips boolean schemas and names a root member ''", () => {
    const rooted = {
      properties: { kind: { const: "root" } },
      components: {
        schemas: {
          Any: true,
          Pet: { discriminator: { propertyName: "kind" }, oneOf: [{ $ref: "#/" }] },
        },
      },
    };

    const conflicts = findDiscriminatorValueConflicts(rooted);

    expect(conflicts.map(({ member, values }) => [member, values])).toEqual([["#/", [""]]]);
  });
});
