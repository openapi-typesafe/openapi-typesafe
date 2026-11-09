import { QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import type { HttpMethod, PathsWithMethod } from "openapi-typesafe-helpers";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient from "../src/index.js";

/**
 * `Parameters<typeof $api.queryOptions>` had `path: never` (upstream #2178): TypeScript replaces
 * the type parameters with their constraints, and `PathsWithMethod<Paths, HttpMethod>` meant the
 * paths that have every method. Now it is every path, so a helper can take the arguments of
 * `queryOptions`. A call with a union of paths or methods is still checked against each of them.
 */

type Item = { id: number };

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": Item[] } } } };
    post: {
      requestBody: { content: { "application/json": Item } };
      responses: { 201: { content: { "application/json": Item } } };
    };
  };
  "/feed": {
    get: { responses: { 200: { content: { "application/json": Item[] } } } };
    post: { responses: { 200: { content: { "application/json": Item[] } } } };
  };
  "/items/{id}": {
    get: {
      parameters: { path: { id: number } };
      responses: { 200: { content: { "application/json": Item } } };
    };
  };
};

const BASE_URL = "https://api.example.com";

const $api = createClient(createFetchClient<Paths>({ baseUrl: BASE_URL }));

type QueryArguments = Parameters<typeof $api.queryOptions>;

/** The helper of the issue: invalidate the query that `queryOptions(...args)` describes. */
function invalidate(queryClient: QueryClient, ...args: QueryArguments): Promise<void> {
  const { queryKey } = $api.queryOptions(...args);
  return queryClient.invalidateQueries({ queryKey });
}

describe("Parameters of the hooks", () => {
  it("PathsWithMethod of every method is every path", () => {
    expectTypeOf<PathsWithMethod<Paths, HttpMethod>>().toEqualTypeOf<
      "/items" | "/feed" | "/items/{id}"
    >();
    expectTypeOf<PathsWithMethod<Paths, "post">>().toEqualTypeOf<"/items" | "/feed">();
  });

  it("PathsWithMethod of some methods is the paths that have each of them", () => {
    expectTypeOf<PathsWithMethod<Paths, "get" | "post">>().toEqualTypeOf<"/items" | "/feed">();
  });

  it("Parameters of queryOptions take a path with its init", () => {
    const list: QueryArguments = ["get", "/items", {}];
    const one: QueryArguments = ["get", "/items/{id}", { params: { path: { id: 1 } } }];

    expectTypeOf(list).toExtend<QueryArguments>();
    expectTypeOf(one).toExtend<QueryArguments>();
  });

  it("Parameters of queryOptions require the init when one operation requires it", () => {
    // @ts-expect-error "/items/{id}" needs its path parameter, so the init may not be left out
    const list: QueryArguments = ["get", "/items"];

    expectTypeOf(list).toExtend<QueryArguments>();
  });

  it("Parameters of useQuery and useSuspenseQuery take a path with its init", () => {
    expectTypeOf<["get", "/items", {}]>().toExtend<Parameters<typeof $api.useQuery>>();
    expectTypeOf<["get", "/items", {}]>().toExtend<Parameters<typeof $api.useSuspenseQuery>>();
  });

  it("queryOptions with a union of paths requires the init that one of them requires", () => {
    const path = "/items/{id}" as "/items" | "/items/{id}";

    // @ts-expect-error "/items/{id}" needs its path parameter
    const options = $api.queryOptions("get", path);

    expect(options.queryKey[1]).toBe("/items/{id}");
  });

  it("queryOptions with a union of methods takes only a path that has each of them", () => {
    const method = "post" as "get" | "post";

    // @ts-expect-error "/items/{id}" has no post
    $api.queryOptions(method, "/items/{id}", { params: { path: { id: 1 } } });
    const { queryKey } = $api.queryOptions(method, "/feed");

    expect(queryKey).toEqual(["post", "/feed", { baseUrl: BASE_URL }]);
  });

  it("a helper over Parameters of queryOptions invalidates that query", async () => {
    const queryClient = new QueryClient();
    const { queryKey } = $api.queryOptions("get", "/items/{id}", { params: { path: { id: 1 } } });
    queryClient.setQueryData(queryKey, { id: 1 });

    await invalidate(queryClient, "get", "/items/{id}", { params: { path: { id: 1 } } });

    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
  });
});
