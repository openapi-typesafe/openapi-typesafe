import { describe, expect, it } from "vitest";
import createClient, { defaultPathSerializer } from "../../src/index.js";

/** Path parameters that make a dot path segment (task 7.6, ADR-013). */

type Paths = {
  "/books/{category}": {
    post: {
      parameters: { path: { category: string } };
      requestBody: { content: { "text/plain": string } };
      responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
  };
};

/** A path with a query string in its template, as some schemas write a version. */
type VersionedPaths = {
  "/books/{category}?v=2": {
    get: {
      parameters: { path: { category: string } };
      responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
  };
};

const BASE_URL = "https://api.example.com";

function recordingClient<P extends {} = Paths>(requests: Request[]) {
  return createClient<P>({
    baseUrl: BASE_URL,
    fetch: async (request) => {
      requests.push(request);
      return Response.json({ ok: true });
    },
  });
}

describe("dot path segments (upstream #2483)", () => {
  it.each([".", ".."])("defaultPathSerializer rejects the path parameter %j", (value) => {
    expect(() => defaultPathSerializer("/books/{category}", { category: value })).toThrow(/Dot path segment/);
  });

  it("defaultPathSerializer rejects an array that serializes to a dot segment", () => {
    expect(() => defaultPathSerializer("/books/{category}", { category: [".."] })).toThrow(/Dot path segment/);
  });

  it.each(["...", "a..", ".hidden", "%2e%2e"])("defaultPathSerializer keeps the path parameter %j", (value) => {
    expect(defaultPathSerializer("/books/{category}", { category: value })).toBe(`/books/${encodeURIComponent(value)}`);
  });

  it.each([
    ["/books/{category}?v=2", "."],
    ["/books/{category}?v=2", ".."],
    ["/books/{category}#top", "."],
    ["/books/{category}#top", ".."],
    ["/books/{category}?v=2#top", ".."],
  ])("defaultPathSerializer rejects a dot segment before the query or fragment of %s (%j)", (path, value) => {
    expect(() => defaultPathSerializer(path, { category: value })).toThrow(/Dot path segment/);
  });

  it("defaultPathSerializer does not read the query of the path template as segments", () => {
    expect(defaultPathSerializer("/books/{category}?next=/../x#/./y", { category: "a" })).toBe(
      "/books/a?next=/../x#/./y",
    );
  });

  it("a request with a dot path parameter rejects before fetch is called", async () => {
    const requests: Request[] = [];

    const request = recordingClient(requests).POST("/books/{category}", {
      params: { path: { category: ".." } },
      body: "x",
    });

    await expect(request).rejects.toThrow(/Dot path segment/);
    expect(requests).toEqual([]);
  });

  it("a request to a path with a query string and a dot path parameter rejects", async () => {
    const requests: Request[] = [];
    const request = recordingClient<VersionedPaths>(requests).GET("/books/{category}?v=2", {
      params: { path: { category: ".." } },
    });

    await expect(request).rejects.toThrow(/Dot path segment/);
    expect(requests).toEqual([]);
  });
});

/**
 * A path that starts with `//` after the parameters are put in is a protocol-relative URL. With a
 * relative `baseUrl` (the default `""`) a browser resolves `//evil.example` to another host and
 * sends the request there, credentials included (ADR-030, amendment).
 */
describe("empty first path segment", () => {
  it.each([
    ["an empty string", { org: "", repo: "evil.example" }],
    ["an empty array", { org: [], repo: "evil.example" }],
    ["an empty object", { org: {}, repo: "evil.example" }],
  ])("defaultPathSerializer rejects %s as the first segment", (_, params) => {
    expect(() => defaultPathSerializer("/{org}/{repo}", params)).toThrow(/Empty first path segment/);
  });

  it("defaultPathSerializer rejects it before a query string", () => {
    expect(() => defaultPathSerializer("/{org}/{repo}?v=2", { org: "", repo: "evil.example" })).toThrow(
      /Empty first path segment/,
    );
  });

  it.each([
    ["/{org}/{repo}", { org: "acme", repo: "" }, "/acme/"],
    ["/files/{id}", { id: "" }, "/files/"],
    ["/a/{org}/{repo}", { org: "", repo: "x" }, "/a//x"],
    ["/{org}", { org: "" }, "/"],
  ])("defaultPathSerializer keeps an empty segment that is not first: %s %j", (path, params, expected) => {
    expect(defaultPathSerializer(path, params)).toBe(expected);
  });

  it("a request with an empty first segment rejects before fetch is called", async () => {
    const requests: Request[] = [];
    const client = createClient<{
      "/{org}/{repo}": {
        get: {
          parameters: { path: { org: string; repo: string } };
          responses: { 200: { content: { "application/json": { ok: boolean } } } };
        };
      };
    }>({
      baseUrl: "",
      fetch: async (request) => {
        requests.push(request);
        return Response.json({ ok: true });
      },
    });

    const request = client.GET("/{org}/{repo}", { params: { path: { org: "", repo: "evil.example" } } });

    await expect(request).rejects.toThrow(/Empty first path segment/);
    expect(requests).toEqual([]);
  });
});
