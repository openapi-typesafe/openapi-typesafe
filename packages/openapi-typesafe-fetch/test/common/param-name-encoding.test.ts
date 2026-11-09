import { describe, expect, it } from "vitest";
import { createFinalURL, createQuerySerializer, defaultPathSerializer } from "../../src/index.js";

/**
 * Parameter names and object keys can be data, such as the keys of an `additionalProperties`
 * query object. Values were encoded and names were not, so a key `a&admin` added a query
 * parameter and a key `a/b` added a path segment (ADR-013, decision 9). Object keys are encoded as
 * values are, `,` `[` `]` included, so a key cannot add members to its object (amendment).
 */

const serialize = (query: Record<string, unknown>, options = {}) =>
  createQuerySerializer(options)(query);

describe("query parameter names", () => {
  it.each([
    [{ "a&admin": "1" }, "a%26admin=1"],
    [{ "a=b": "1" }, "a%3Db=1"],
    [{ "a#b": "1" }, "a%23b=1"],
    [{ "a b": "1" }, "a%20b=1"],
    [{ tags: ["x"], "t&x": ["y"] }, "tags=x&t%26x=y"],
  ])("a name with structure characters is encoded: %j", (query, expected) => {
    expect(serialize(query)).toBe(expected);
  });

  it.each([
    [{ "filter[status]": "open" }, "filter[status]=open"],
    [{ $filter: "a" }, "$filter=a"],
    [{ "page:size": "1", "a,b": "2", "x@y": "3" }, "page:size=1&a,b=2&x@y=3"],
    [{ "user-id_1.x~": "1" }, "user-id_1.x~=1"],
  ])("a name without structure characters is unchanged: %j", (query, expected) => {
    expect(serialize(query)).toBe(expected);
  });

  it("deepObject keys are encoded", () => {
    expect(serialize({ f: { "k&x": "v" } })).toBe("f[k%26x]=v");
  });

  it("deepObject keys encode brackets, so a key cannot close its own bracket", () => {
    expect(serialize({ filter: { "tag][role": "admin" } })).toBe("filter[tag%5D%5Brole]=admin");
  });

  it("form object keys are encoded, exploded or not", () => {
    const object = { "x&y": "1" };

    expect(serialize({ f: object }, { object: { style: "form", explode: true } })).toBe("x%26y=1");
    expect(serialize({ f: object }, { object: { style: "form", explode: false } })).toBe(
      "f=x%26y,1",
    );
  });

  it("an unexploded form object key with commas stays one key", () => {
    const filter = { "color,role,admin,x": "red" };

    expect(serialize({ filter }, { object: { style: "form", explode: false } })).toBe(
      "filter=color%2Crole%2Cadmin%2Cx,red",
    );
  });

  it.each([
    ["$filter", "%24filter"],
    ["a:b", "a%3Ab"],
    ["a@b", "a%40b"],
  ])("an object key %j keeps no name exception: %s", (key, encoded) => {
    expect(serialize({ f: { [key]: "1" } })).toBe(`f[${encoded}]=1`);
  });

  it("allowReserved keeps values as written but still encodes names", () => {
    expect(serialize({ "a&b": "x&y" }, { allowReserved: true })).toBe("a%26b=x&y");
  });
});

describe("path object keys", () => {
  it.each([
    ["/users/{id}", "/users/a%2Fb,1"],
    ["/users/{id*}", "/users/a%2Fb=1"],
    ["/users/{.id}", "/users/.a%2Fb,1"],
    ["/users/{;id*}", "/users/;a%2Fb=1"],
  ])("a key with a slash does not add a segment in %s", (path, expected) => {
    expect(defaultPathSerializer(path, { id: { "a/b": 1 } })).toBe(expected);
  });

  it.each([
    ["/items/{filter}", "/items/color%2Crole%2Cadmin%2Cx,red"],
    ["/items/{filter*}", "/items/color%2Crole%2Cadmin%2Cx=red"],
    ["/items/{.filter}", "/items/.color%2Crole%2Cadmin%2Cx,red"],
    ["/items/{;filter}", "/items/;filter=color%2Crole%2Cadmin%2Cx,red"],
  ])("a key with commas stays one key in %s", (path, expected) => {
    expect(defaultPathSerializer(path, { filter: { "color,role,admin,x": "red" } })).toBe(expected);
  });

  it("the final URL keeps an encoded key inside one segment", () => {
    const url = createFinalURL("/users/{id}", {
      baseUrl: "https://api.example",
      params: { path: { id: { "../admin": 1 } } },
      querySerializer: createQuerySerializer(),
      pathSerializer: defaultPathSerializer,
    });

    expect(url).toBe("https://api.example/users/..%2Fadmin,1");
  });
});

/** `String.prototype.replace` reads `$'`, `` $` ``, `$&` and `$$` in a string replacement. */
describe("replacement patterns in path values", () => {
  it.each([
    ["$'", "%24'"],
    ["$`", "%24%60"],
    ["$&", "%24%26"],
    ["$$", "%24%24"],
    ["$1", "%241"],
  ])("defaultPathSerializer writes the object key %j as text", (key, written) => {
    const serialized = defaultPathSerializer("/{filter}/{id}?v=1", {
      filter: { [key]: "" },
      id: "evil.example",
    });

    expect(serialized).toBe(`/${written},/evil.example?v=1`);
  });

  it.each(["$'", "$`", "$&", "$$"])(
    "defaultPathSerializer writes the primitive %j as text",
    (value) => {
      expect(defaultPathSerializer("/a/{id}/b", { id: value })).toBe(
        `/a/${encodeURIComponent(value)}/b`,
      );
    },
  );
});
