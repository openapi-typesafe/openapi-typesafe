import { describe, expect, it } from "vitest";
import createClient, { serializeArrayParam, serializeObjectParam } from "../../src/index.js";

/**
 * A nested array or object has no standard encoding in any parameter location. The error names
 * the hook of that location: a nested path value said to write a `querySerializer()`, which does
 * not apply to the path.
 */

type Paths = {
  "/items/{id}": {
    get: {
      parameters: {
        path: { id: unknown };
        query?: { filter?: unknown };
        header?: { "X-List"?: unknown[] };
      };
      responses: { 200: { content: { "application/json": string } } };
    };
  };
};

type Params = Paths["/items/{id}"]["get"]["parameters"];

function send(params: Params) {
  const client = createClient<Paths>({
    baseUrl: "https://api.example.com",
    fetch: async () => Response.json("ok"),
  });
  return client.GET("/items/{id}", { params });
}

describe("nested parameter errors", () => {
  it("a nested path array names pathSerializer", async () => {
    const request = send({ path: { id: [[1]] } });

    await expect(request).rejects.toThrow(
      "Deeply-nested arrays/objects aren’t supported in path parameters. " +
        "Provide your own `pathSerializer()` to handle these.",
    );
  });

  it("a nested path object member names pathSerializer", async () => {
    const request = send({ path: { id: { a: { b: 1 } } } });

    await expect(request).rejects.toThrow(
      "in path parameters. Provide your own `pathSerializer()`",
    );
  });

  it("a nested query value names querySerializer", async () => {
    const request = send({ path: { id: 1 }, query: { filter: [[1]] } });

    await expect(request).rejects.toThrow(
      "Deeply-nested arrays/objects aren’t supported. " +
        "Provide your own `querySerializer()` to handle these.",
    );
  });

  it("a nested header value names no serializer", async () => {
    const request = send({ path: { id: 1 }, header: { "X-List": [[1]] } });

    await expect(request).rejects.toThrow(
      /^Deeply-nested arrays\/objects aren’t supported in header parameters\.$/,
    );
  });

  it("a flat path array and object are still sent", async () => {
    await expect(send({ path: { id: [1, 2] } })).resolves.toMatchObject({ data: "ok" });
    await expect(send({ path: { id: { a: 1 } } })).resolves.toMatchObject({ data: "ok" });
  });
});

describe("exported serializers with a nested member", () => {
  const PATH_HINT = "in path parameters. Provide your own `pathSerializer()`";
  const QUERY_HINT = "aren’t supported. Provide your own `querySerializer()`";

  it("serializeArrayParam in a path style names pathSerializer", () => {
    for (const style of ["simple", "label", "matrix"] as const) {
      const serialize = () => serializeArrayParam("id", [[1]], { style, explode: false });

      expect(serialize).toThrow(PATH_HINT);
    }
  });

  it("serializeObjectParam in a path style names pathSerializer", () => {
    const serialize = () =>
      serializeObjectParam("x", { a: { b: 1 } }, { style: "simple", explode: true });

    expect(serialize).toThrow(PATH_HINT);
  });

  it("serializeArrayParam in a query style names querySerializer", () => {
    const serialize = () => serializeArrayParam("id", [[1]], { style: "form", explode: true });

    expect(serialize).toThrow(QUERY_HINT);
  });

  it("serializeObjectParam in a query style names querySerializer", () => {
    const serialize = () =>
      serializeObjectParam("x", { a: { b: 1 } }, { style: "deepObject", explode: true });

    expect(serialize).toThrow(QUERY_HINT);
  });

  it("a custom pathSerializer built on serializeArrayParam names pathSerializer", async () => {
    const client = createClient<Paths>({
      baseUrl: "https://api.example.com",
      fetch: async () => Response.json("ok"),
    });
    const pathSerializer = (path: string, params: Record<string, unknown>) =>
      path.replace("{id}", serializeArrayParam("id", params.id as unknown[], PATH_STYLE));

    const request = client.GET("/items/{id}", { params: { path: { id: [[1]] } }, pathSerializer });

    await expect(request).rejects.toThrow(PATH_HINT);
  });
});

const PATH_STYLE = { style: "simple", explode: false } as const;
