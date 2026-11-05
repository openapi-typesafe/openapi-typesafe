import { describe, expect, it } from "vitest";
import {
  isUnionMember,
  unionAt,
  unionMaps,
  unionMembers,
  unionReaches,
} from "../../../src/domain/openapi/discriminated-union.js";

const ref = (name: string) => ({ $ref: `#/schemas/${name}` });

/** An in-memory document: `$ref` → schema. */
function resolverOf(schemas: Record<string, unknown>) {
  return (target: string) => schemas[target.replace("#/schemas/", "")];
}

describe("unionMembers", () => {
  it("unionMembers lists oneOf, then anyOf members", () => {
    expect(unionMembers({ oneOf: [ref("A")], anyOf: [ref("B")] })).toEqual([ref("A"), ref("B")]);
  });

  it("unionMembers of a non-object is empty", () => {
    expect(unionMembers(true)).toEqual([]);
    expect(unionMembers([ref("A")])).toEqual([]);
  });
});

describe("unionAt", () => {
  it("unionAt returns a schema with members and nothing for another schema", () => {
    const resolve = resolverOf({ U: { oneOf: [ref("A")] }, P: { type: "object" } });

    expect(unionAt(ref("U").$ref, resolve)).toEqual({ oneOf: [ref("A")] });
    expect(unionAt(ref("P").$ref, resolve)).toBeUndefined();
    expect(unionAt(ref("Missing").$ref, resolve)).toBeUndefined();
  });
});

describe("unionReaches", () => {
  it("unionReaches finds a direct member", () => {
    expect(unionReaches({ oneOf: [ref("A")] }, ref("A").$ref, resolverOf({}))).toBe(true);
  });

  it("unionReaches follows $ref and allOf, oneOf and anyOf items", () => {
    const resolve = resolverOf({ M: { allOf: [{ anyOf: [ref("A")] }] } });

    expect(unionReaches({ oneOf: [ref("M")] }, ref("A").$ref, resolve)).toBe(true);
  });

  it("unionReaches does not follow properties or array items", () => {
    const members = [{ properties: { a: ref("A") } }, { items: ref("A") }, true];

    expect(unionReaches({ anyOf: members }, ref("A").$ref, resolverOf({}))).toBe(false);
  });

  it("unionReaches ends on a $ref cycle", () => {
    const resolve = resolverOf({ M: { oneOf: [ref("N")] }, N: { oneOf: [ref("M")] } });

    expect(unionReaches({ oneOf: [ref("M")] }, ref("A").$ref, resolve)).toBe(false);
  });
});

describe("unionMaps", () => {
  const CAT = "#/components/schemas/Cat";

  it("unionMaps reads a bare name as a component schema and a $ref as written", () => {
    const named = { discriminator: { propertyName: "kind", mapping: { cat: "Cat" } } };
    const pointed = { discriminator: { propertyName: "kind", mapping: { cat: CAT } } };

    expect(unionMaps(named, CAT)).toBe(true);
    expect(unionMaps(pointed, CAT)).toBe(true);
    expect(unionMaps(named, "#/components/schemas/Dog")).toBe(false);
  });

  it("unionMaps skips a mapping value that is not a string, and a union with no mapping", () => {
    const invalid = { discriminator: { propertyName: "kind", mapping: { cat: 1 } } };

    expect(unionMaps(invalid as never, CAT)).toBe(false);
    expect(unionMaps({ oneOf: [] }, CAT)).toBe(false);
  });
});

describe("isUnionMember", () => {
  it("isUnionMember accepts a mapped schema and a reached one", () => {
    const union = { oneOf: [ref("A")], discriminator: { propertyName: "k", mapping: { b: "B" } } };
    const resolve = resolverOf({});

    expect(isUnionMember(union, "#/components/schemas/B", resolve)).toBe(true);
    expect(isUnionMember(union, ref("A").$ref, resolve)).toBe(true);
    expect(isUnionMember(union, ref("C").$ref, resolve)).toBe(false);
  });
});
