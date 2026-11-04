import { describe, expect, it } from "vitest";
import {
  isExplodedQueryObject,
  isObjectSchema,
} from "../../src/application/transform/document/exploded-query.js";
import type { RefResolver } from "../../src/application/transform/schema/schema-context.js";

/** Which query parameters send an object as its own keys (`exploded-query-objects`, #2361). */

/** An in-memory resolver over a map of `$ref`s. */
function refsOf(schemas: Record<string, unknown>): RefResolver {
  return { resolve: (ref) => schemas[ref] };
}

const NO_REFS = refsOf({});
const OBJECT = { type: "object", properties: { page: { type: "number" } } } as const;

describe("isObjectSchema", () => {
  it("isObjectSchema follows a $ref to an object", () => {
    expect(isObjectSchema({ $ref: "#/a" }, refsOf({ "#/a": OBJECT }))).toBe(true);
  });

  it("isObjectSchema with a $ref that does not resolve is no object", () => {
    expect(isObjectSchema({ $ref: "#/missing" }, NO_REFS)).toBe(false);
  });

  it("isObjectSchema with a $ref cycle is no object and terminates", () => {
    const refs = refsOf({ "#/a": { $ref: "#/b" }, "#/b": { $ref: "#/a" } });

    expect(isObjectSchema({ $ref: "#/a" }, refs)).toBe(false);
  });

  it("isObjectSchema reads object keywords without a type and compositions of objects", () => {
    expect(isObjectSchema({ additionalProperties: true }, NO_REFS)).toBe(true);
    expect(isObjectSchema({ allOf: [OBJECT, { type: ["object", "null"] }] }, NO_REFS)).toBe(true);
    expect(isObjectSchema({ oneOf: [OBJECT, { type: "string" }] }, NO_REFS)).toBe(false);
  });
});

describe("isExplodedQueryObject", () => {
  it("isExplodedQueryObject takes form and explode as the defaults of a query parameter", () => {
    expect(isExplodedQueryObject({ name: "q", in: "query", schema: OBJECT }, NO_REFS)).toBe(true);
  });

  it("isExplodedQueryObject with explode false, another style or no schema is false", () => {
    const query = { name: "q", in: "query" } as const;

    expect(isExplodedQueryObject({ ...query, schema: OBJECT, explode: false }, NO_REFS)).toBe(
      false,
    );
    expect(isExplodedQueryObject({ ...query, schema: OBJECT, style: "deepObject" }, NO_REFS)).toBe(
      false,
    );
    expect(isExplodedQueryObject(query, NO_REFS)).toBe(false);
  });
});
