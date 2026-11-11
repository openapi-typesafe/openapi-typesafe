import { describe, expect, it } from "vitest";
import createClient from "../../src/index.js";

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
