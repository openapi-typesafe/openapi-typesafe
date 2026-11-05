import { describe, expect, it } from "vitest";
import {
  unionAt,
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
