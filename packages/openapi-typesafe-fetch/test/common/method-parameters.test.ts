import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, { type IsInitOptional } from "../../src/index.js";

/**
 * `Parameters<typeof client.request>` had `path: never` (upstream #2178): TypeScript replaces the
 * type parameters with their constraints, and `PathsWithMethod<Paths, HttpMethod>` meant the paths
 * that have every method. Now it is every path. A call with a union of paths or methods is still
 * checked against each of them: the init is required when one operation requires it, and each
 * method must exist on the path.
 */

type Item = { id: number };
type ListItems = { responses: { 200: { content: { "application/json": Item[] } } } };

type Paths = {
  "/items": { get: ListItems };
  "/feed": { get: ListItems; post: ListItems };
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
  it("Parameters of request take a path with its init", () => {
    const list: RequestArguments = ["get", "/items", {}];
    const one: RequestArguments = ["get", "/items/{id}", { params: { path: { id: 1 } } }];

    expectTypeOf(list).toExtend<RequestArguments>();
    expectTypeOf(one).toExtend<RequestArguments>();
  });

  it("Parameters of request require the init when one operation requires it", () => {
    // @ts-expect-error "/items/{id}" needs its path parameter, so the init may not be left out
    const list: RequestArguments = ["get", "/items"];

    expectTypeOf(list).toExtend<RequestArguments>();
  });

  it("IsInitOptional of a union is false when one init is required", () => {
    expectTypeOf<IsInitOptional<{ params: { id: number } } | undefined>>().toEqualTypeOf<false>();
    expectTypeOf<IsInitOptional<{ params?: { id: number } } | undefined>>().toEqualTypeOf<true>();
    expectTypeOf<IsInitOptional<{ params: { id: number } }>>().toEqualTypeOf<false>();
    expectTypeOf<IsInitOptional<{ params?: { id: number } }>>().toEqualTypeOf<true>();
  });

  it("a call with a union of paths requires the init that one of them requires", async () => {
    const client = createClient<Paths>({ baseUrl: BASE_URL, fetch: async () => Response.json([]) });
    const path = "/items/{id}" as "/items" | "/items/{id}";

    // @ts-expect-error "/items/{id}" needs its path parameter
    await client.GET(path);
    // @ts-expect-error "/items/{id}" needs its path parameter
    await client.request("get", path);

    expect(path).toBe("/items/{id}");
  });

  it("a call with a union of methods takes only a path that has each of them", async () => {
    const client = createClient<Paths>({ baseUrl: BASE_URL, fetch: async () => Response.json([]) });
    const method = "post" as "get" | "post";

    // @ts-expect-error "/items" has no post
    await client.request(method, "/items");
    const { data } = await client.request(method, "/feed");

    expect(data).toEqual([]);
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
