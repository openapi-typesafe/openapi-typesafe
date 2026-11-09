import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  appendPointer,
  canonicalRef,
  childPointer,
  createRef,
  parseRefPointer,
  ROOT_POINTER,
} from "../../../src/domain/openapi/json-pointer.js";

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
    [["#/"], "#/%23~1"],
  ] as const)("createRef(%j) is %s", (parts, ref) => {
    expect(createRef(parts)).toBe(ref);
  });

  it("createRef reads a part that contains #/ as a $ref, as the original did", () => {
    expect(createRef(["#/a", "#/%41"])).toBe("#/a/A");
  });

  it("createRef with a ref-like part whose percent escape is malformed throws URIError", () => {
    expect(() => createRef(["#/paths", "#/% x"])).toThrow(URIError);
  });
});

describe("appendPointer", () => {
  it.each([
    ["#/components/schemas", ["a/b~c"], "#/components/schemas/a~1b~0c"],
    ["#/paths", ["#/% x"], "#/paths/%23~1%25 x"],
    ["#/paths", ["#/%41"], "#/paths/%23~1%2541"],
    ["#/a", ["parameters", 0, "x"], "#/a/parameters/0/x"],
    ["#/a", [undefined, null, "", "x"], "#/a/x"],
    ["#/a", [], "#/a"],
    [ROOT_POINTER, ["paths", "/items"], "#/paths/~1items"],
    [undefined, ["x"], "#/x"],
    ["", ["x"], "#/x"],
  ] as const)("appendPointer(%j, %j) is %s", (base, segments, pointer) => {
    expect(appendPointer(base, segments)).toBe(pointer);
  });

  it("appendPointer escapes every # so a key a# does not end the pointer early", () => {
    const pointer = appendPointer(appendPointer(ROOT_POINTER, ["paths", "/a#b#"]), ["get"]);

    expect(pointer).toBe("#/paths/~1a%23b%23/get");
    expect(parseRefPointer(pointer)).toEqual(["paths", "/a#b#", "get"]);
  });

  // The exported transformers accept any `path`; the original read it as a `createRef` part.
  it.each([
    ["/items/{id}", "#/~1items~1{id}/x"],
    ["other.yaml#/a", "#/a/x"],
  ])("appendPointer reads the non-pointer base %j as createRef does", (base, pointer) => {
    expect(appendPointer(base, ["x"])).toBe(pointer);
  });

  it("appendPointer segments read back unchanged, whatever text they hold", () => {
    const segment = fc.oneof(
      fc.string({ minLength: 1 }),
      fc.constantFrom("#/", "#", "a#", "%", "%zz", "~", "~1", "/", "#/%41"),
    );
    fc.assert(
      fc.property(fc.array(segment), fc.array(segment), (first, second) => {
        const pointer = appendPointer(appendPointer(ROOT_POINTER, first), second);

        expect(parseRefPointer(pointer)).toEqual([...first, ...second]);
      }),
    );
  });
});

// Upstream #2251, #2828: a `%` in a name was not escaped, so reading the pointer back threw
// URIError ("50%") or decoded the name ("a%2Fb" became "a/b").
describe("createRef with a percent sign in a name", () => {
  it.each(["50%", "a%2Fb", "x%zz", "%"])(
    "createRef escapes %j so it reads back unchanged",
    (name) => {
      const ref = createRef(["#/components/schemas/Rate", "properties", name]);

      expect(parseRefPointer(ref)).toEqual(["components", "schemas", "Rate", "properties", name]);
    },
  );

  it("createRef escapes % as %25", () => {
    expect(createRef(["#/a", "50%"])).toBe("#/a/50%25");
  });
});

describe("childPointer", () => {
  it.each([
    ["#", "a/b", "#/a~1b"],
    ["#/a", "50%#", "#/a/50%25%23"],
    ["#/a", "", "#/a/"],
  ])("childPointer(%j, %j) is %s", (pointer, key, child) => {
    expect(childPointer(pointer, key)).toBe(child);
  });
});

describe("canonicalRef", () => {
  it.each([
    ["#/components/schemas/a#b", "#/components/schemas/a%23b"],
    ["#/components/schemas/a%23b", "#/components/schemas/a%23b"],
    ["#/components/schemas/a%20b", "#/components/schemas/a b"],
    ["#/components/schemas/a~1b", "#/components/schemas/a~1b"],
    // Redocly writes a bundled mapping value percent-decoded; it is read as written.
    ["#/components/schemas/50%", "#/components/schemas/50%25"],
    ["#/components/schemas/a~0%zz", "#/components/schemas/a~0%25zz"],
    ["other.yaml#/a", "other.yaml#/a"],
    ["Pet", "Pet"],
  ])("canonicalRef(%j) is %j", (ref, canonical) => {
    expect(canonicalRef(ref)).toBe(canonical);
  });
});
