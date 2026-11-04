import createFetchClient from "openapi-typesafe-fetch";
import type { MediaType } from "openapi-typesafe-helpers";
import { describe, expectTypeOf, it } from "vitest";
import createClient, {
  type InfiniteQueryKey,
  type QueryKey,
  type QueryOptionsFunction,
  type UseInfiniteQueryMethod,
  type UseMutationMethod,
  type UseQueryMethod,
  type UseSuspenseQueryMethod,
} from "../src/index.js";

/**
 * The generator writes `export interface paths`, and an interface has no index signature, so the
 * method types rejected it with TS2344 (upstream #2267). They take any `Paths`, like
 * `OpenapiQueryClient`. Type checks: `tsc` runs them, the hooks are never called.
 */

type Item = { id: number };

interface paths {
  "/items": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: {
      parameters: { query?: { cursor?: string } };
      responses: { 200: { content: { "application/json": Item[] } } };
    };
    put?: never;
    post: {
      requestBody: { content: { "application/json": Item } };
      responses: { 201: { content: { "application/json": Item } } };
    };
    delete?: never;
  };
}

const $api = createClient(createFetchClient<paths>({ baseUrl: "https://api.example.com" }));

describe("method types with a generated paths interface", () => {
  it("UseMutationMethod of an interface wraps useMutation", () => {
    const useMutation: UseMutationMethod<paths, MediaType> = (...args) => $api.useMutation(...args);
    const mutation = () => useMutation("post", "/items");

    expectTypeOf<ReturnType<typeof mutation>["data"]>().toEqualTypeOf<Item | undefined>();
  });

  it("UseQueryMethod and UseSuspenseQueryMethod of an interface type the hooks", () => {
    const useQuery: UseQueryMethod<paths, MediaType> = $api.useQuery;
    const useSuspenseQuery: UseSuspenseQueryMethod<paths, MediaType> = $api.useSuspenseQuery;
    const query = () => useQuery("get", "/items");
    const suspense = () => useSuspenseQuery("get", "/items");

    expectTypeOf<ReturnType<typeof query>["data"]>().toEqualTypeOf<Item[] | undefined>();
    expectTypeOf<ReturnType<typeof suspense>["data"]>().toEqualTypeOf<Item[]>();
  });

  it("QueryOptionsFunction and UseInfiniteQueryMethod of an interface are the client's types", () => {
    expectTypeOf<QueryOptionsFunction<paths, MediaType>>().toEqualTypeOf($api.queryOptions);
    expectTypeOf<UseInfiniteQueryMethod<paths, MediaType>>().toEqualTypeOf($api.useInfiniteQuery);
  });

  it("QueryKey and InfiniteQueryKey of an interface are the method and path", () => {
    type ItemsKey = QueryKey<paths, "get", "/items", undefined>;

    expectTypeOf<ItemsKey>().toEqualTypeOf<readonly ["get", "/items"]>();
    expectTypeOf<InfiniteQueryKey<paths, "get", "/items">>().toExtend<readonly unknown[]>();
  });
});
