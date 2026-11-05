import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, { type IsInitOptional } from "../../src/index.js";

/**
 * `Parameters<typeof client.request>` had `path: never` (upstream #2178): TypeScript replaces the
 * type parameters with their constraints, and `PathsWithMethod<Paths, HttpMethod>` meant the paths
 * that have every method. Now it is every path, and the init stays optional when some operation
 * needs none.
 */

type Item = { id: number };
type ListItems = { responses: { 200: { content: { "application/json": Item[] } } } };

type Paths = {
  "/items": { get: ListItems };
  "/items/{id}": {
    get: {
      parameters: { path: { id: number } };
      responses: { 200: { content: { "application/json": Item } } };
    };
  };
};

const BASE_URL = "https://api.example.com";

type RequestArguments = Parameters<ReturnType<typeof createClient<Paths>>["request"]>;

describe("Parameters of client.request", () => {
  it("Parameters of request take a path without and a path with an init", () => {
    const list: RequestArguments = ["get", "/items"];
    const one: RequestArguments = ["get", "/items/{id}", { params: { path: { id: 1 } } }];

    expectTypeOf(list).toExtend<RequestArguments>();
    expectTypeOf(one).toExtend<RequestArguments>();
  });

  it("IsInitOptional of a union is true when one init may be left out", () => {
    expectTypeOf<IsInitOptional<{ params: { id: number } } | undefined>>().toEqualTypeOf<true>();
    expectTypeOf<IsInitOptional<{ params: { id: number } }>>().toEqualTypeOf<false>();
    expectTypeOf<IsInitOptional<{ params?: { id: number } }>>().toEqualTypeOf<true>();
  });

  it("a helper over Parameters of request sends the request", async () => {
    const urls: string[] = [];
    const client = createClient<Paths>({
      baseUrl: BASE_URL,
      fetch: async (request) => {
        urls.push(request.url);
        return Response.json({ id: 1 });
      },
    });
    const send = (...args: RequestArguments) => client.request(...args);

    const { data } = await send("get", "/items/{id}", { params: { path: { id: 1 } } });

    expect(data).toEqual({ id: 1 });
    expect(urls).toEqual([`${BASE_URL}/items/1`]);
  });
});
