import { QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import type { HttpMethod, PathsWithMethod } from "openapi-typesafe-helpers";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient from "../src/index.js";

/**
 * `Parameters<typeof $api.queryOptions>` had `path: never` (upstream #2178): TypeScript replaces
 * the type parameters with their constraints, and `PathsWithMethod<Paths, HttpMethod>` meant the
 * paths that have every method. Now it is every path, and the init stays optional when some
 * operation needs none, so a helper can take the arguments of `queryOptions`.
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
    expectTypeOf<PathsWithMethod<Paths, HttpMethod>>().toEqualTypeOf<"/items" | "/items/{id}">();
    expectTypeOf<PathsWithMethod<Paths, "post">>().toEqualTypeOf<"/items">();
  });

  it("Parameters of queryOptions take a path without and a path with an init", () => {
    const list: QueryArguments = ["get", "/items"];
    const one: QueryArguments = ["get", "/items/{id}", { params: { path: { id: 1 } } }];

    expectTypeOf(list).toExtend<QueryArguments>();
    expectTypeOf(one).toExtend<QueryArguments>();
  });

  it("Parameters of useQuery and useSuspenseQuery take a path without an init", () => {
    expectTypeOf<["get", "/items"]>().toExtend<Parameters<typeof $api.useQuery>>();
    expectTypeOf<["get", "/items"]>().toExtend<Parameters<typeof $api.useSuspenseQuery>>();
  });

  it("a helper over Parameters of queryOptions invalidates that query", async () => {
    const queryClient = new QueryClient();
    const { queryKey } = $api.queryOptions("get", "/items/{id}", { params: { path: { id: 1 } } });
    queryClient.setQueryData(queryKey, { id: 1 });

    await invalidate(queryClient, "get", "/items/{id}", { params: { path: { id: 1 } } });

    expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
  });
});
