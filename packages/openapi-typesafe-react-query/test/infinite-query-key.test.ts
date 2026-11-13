import { type InfiniteData, QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, { type InfiniteQueryKey, infiniteQueryKey } from "../src/index.js";

/**
 * `infiniteQueryKey` writes the key `useInfiniteQuery` gives a query. The key of `queryOptions` is
 * tagged with an intersection, which TypeScript spreads as an array, so `[...queryKey, "infinite"]`
 * was no `InfiniteQueryKey`. The type checks run in `tsc`.
 */

type Page = { items: string[]; next: number };

type Paths = {
  "/posts": {
    get: {
      parameters: { query?: { cursor?: number; page?: number; tag?: string } };
      responses: { 200: { content: { "application/json": Page } } };
    };
  };
  "/posts/{id}": {
    get: {
      parameters: { path: { id: number } };
      responses: { 200: { content: { "application/json": Page } } };
    };
  };
};

const $api = createClient(createFetchClient<Paths>({ baseUrl: "https://api.example.com" }));
const INIT = { params: { query: { tag: "a" } } };

describe("infiniteQueryKey", () => {
  it("infiniteQueryKey of a query key adds the marker", () => {
    const { queryKey } = $api.queryOptions("get", "/posts", INIT);

    expect(infiniteQueryKey(queryKey)).toEqual([...queryKey, "infinite"]);
  });

  it("infiniteQueryKey with the default page param name adds nothing more", () => {
    const { queryKey } = $api.queryOptions("get", "/posts", INIT);

    expect(infiniteQueryKey(queryKey, "cursor")).toEqual([...queryKey, "infinite"]);
  });

  it("infiniteQueryKey with another page param name adds it after the marker", () => {
    const { queryKey } = $api.queryOptions("get", "/posts", INIT);

    expect(infiniteQueryKey(queryKey, "page")).toEqual([
      ...queryKey,
      "infinite",
      { pageParamName: "page" },
    ]);
  });

  it("infiniteQueryKey of an optional init is an InfiniteQueryKey", () => {
    const { queryKey } = $api.queryOptions("get", "/posts", INIT);
    const key: InfiniteQueryKey<Paths, "get", "/posts"> = infiniteQueryKey(queryKey);
    const named: InfiniteQueryKey<Paths, "get", "/posts"> = infiniteQueryKey(queryKey, "page");

    expectTypeOf(key).toEqualTypeOf<InfiniteQueryKey<Paths, "get", "/posts">>();
    expect(named).toHaveLength(key.length + 1);
  });

  it("infiniteQueryKey of a required init is an InfiniteQueryKey", () => {
    const { queryKey } = $api.queryOptions("get", "/posts/{id}", { params: { path: { id: 1 } } });
    const key: InfiniteQueryKey<Paths, "get", "/posts/{id}"> = infiniteQueryKey(queryKey);

    expectTypeOf(key).toEqualTypeOf<InfiniteQueryKey<Paths, "get", "/posts/{id}">>();
  });

  it("infiniteQueryKey reads the data useInfiniteQuery caches", () => {
    const queryClient = new QueryClient();
    const key = infiniteQueryKey($api.queryOptions("get", "/posts", INIT).queryKey);
    const data: InfiniteData<Page> = { pages: [{ items: ["a"], next: 2 }], pageParams: [1] };

    queryClient.setQueryData<InfiniteData<Page>>(key, data);

    expect(queryClient.getQueryData<InfiniteData<Page>>(key)).toBe(data);
  });
});
