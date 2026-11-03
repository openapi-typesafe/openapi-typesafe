import { describe, expect, test } from "vitest";
import { createPathBasedClient } from "../../src/index.js";
import { createObservedClient } from "../helpers.js";
import type { paths } from "./schemas/query.js";

/** The OpenAPI 3.2 QUERY method: a safe request with a body (roadmap R2, ADR-020). */
describe("QUERY()", () => {
  test("sends the method and the JSON body", async () => {
    let request: Request | undefined;
    const client = createObservedClient<paths>({}, async (req) => {
      request = req;
      return Response.json([{ title: "Found" }]);
    });

    const { data } = await client.QUERY("/posts/search", { body: { text: "openapi", limit: 5 } });

    expect(request?.method).toBe("QUERY");
    expect(await request?.json()).toEqual({ text: "openapi", limit: 5 });
    expect(data?.[0]?.title).toBe("Found");
  });

  test("types the body and the paths that have a query operation", async () => {
    const client = createObservedClient<paths>({}, async () => Response.json([]));

    // @ts-expect-error `text` is required
    await client.QUERY("/posts/search", { body: { limit: 5 } });
    // @ts-expect-error the path has no query operation
    await client.QUERY("/posts/{id}", { params: { path: { id: 1 } } });
    // @ts-expect-error the body is required
    await client.QUERY("/posts/search");
  });

  test("works through request() and the path-based client", async () => {
    const methods: string[] = [];
    const fetch = async (req: Request) => {
      methods.push(req.method);
      return Response.json([]);
    };
    const client = createObservedClient<paths>({}, fetch);
    const pathClient = createPathBasedClient<paths>({ baseUrl: "https://fake-api.example", fetch });

    await client.request("query", "/posts/search", { body: { text: "a" } });
    await pathClient["/posts/search"].QUERY({ body: { text: "b" } });

    expect(methods).toEqual(["QUERY", "QUERY"]);
  });

  test("the path-based client offers only HTTP methods", () => {
    const pathClient = createPathBasedClient<paths>({ baseUrl: "https://fake-api.example" });

    // @ts-expect-error `parameters` is not a method
    expect(pathClient["/posts/{id}"].PARAMETERS).toBeUndefined();
  });
});
