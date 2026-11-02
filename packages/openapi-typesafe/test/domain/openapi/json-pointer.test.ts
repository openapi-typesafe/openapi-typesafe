import { describe, expect, it } from "vitest";
import { createRef, parseRefPointer } from "../../../src/domain/openapi/json-pointer.js";

describe("parseRefPointer", () => {
  it.each([
    ["#/components/schemas/Foo", ["components", "schemas", "Foo"]],
    ["other.yaml#/components/schemas/Foo", ["components", "schemas", "Foo"]],
    ["#/paths/~1users~1{id}/get", ["paths", "/users/{id}", "get"]],
    ["#/a~0b/c%20d", ["a~b", "c d"]],
    ["#/a//b/", ["a", "b"]],
    ["#/", []],
    ["other.yaml", []],
  ])("parseRefPointer(%j) is %j", (ref, segments) => {
    expect(parseRefPointer(ref)).toEqual(segments);
  });

  it("parseRefPointer decodes ~01 as ~1, not as /", () => {
    expect(parseRefPointer("#/a~01")).toEqual(["a~1"]);
  });

  it("parseRefPointer with a malformed percent escape throws URIError", () => {
    expect(() => parseRefPointer("#/a%zz")).toThrow(URIError);
  });
});

describe("createRef", () => {
  it.each([
    [["#/components", "schemas", "a/b~c"], "#/components/schemas/a~1b~0c"],
    [[undefined, null, "", "x", 0], "#/x/0"],
    [["#/paths/~1users", "get"], "#/paths/~1users/get"],
    [[], "#"],
    [["#/"], "#/#~1"],
  ] as const)("createRef(%j) is %s", (parts, ref) => {
    expect(createRef(parts)).toBe(ref);
  });
});
