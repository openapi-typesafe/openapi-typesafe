import createFetchClient, { type FetchOptions } from "openapi-typesafe-fetch";
import type { FilterKeys, PathsWithMethod } from "openapi-typesafe-helpers";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient from "../src/index.js";

/**
 * Wrappers generic in the path that type the init as `FetchOptions` of the operation, as users of
 * openapi-react-query write them. The hooks' init type for a generic path must take that type
 * (TS2345 in rc.3), while a concrete call keeps its init rules.
 */

type Item = { id: number };
type Paths = {
  "/items": {
    get: {
      parameters: { query?: { limit?: number } };
      responses: { 200: { content: { "application/json": Item[] } } };
    };
  };
  "/items/{id}": {
    get: {
      parameters: { path: { id: number } };
      responses: { 200: { content: { "application/json": Item } } };
    };
  };
};

type GetPath = PathsWithMethod<Paths, "get">;
type GetInit<Path extends GetPath> = FetchOptions<FilterKeys<Paths[Path], "get">>;

const BASE_URL = "https://api.example.com";

const $api = createClient(createFetchClient<Paths>({ baseUrl: BASE_URL }));

function itemOptions<Path extends GetPath>(path: Path, init: GetInit<Path>) {
  return $api.queryOptions("get", path, init);
}

function useItem<Path extends GetPath>(path: Path, init: GetInit<Path>) {
  return $api.useQuery("get", path, init);
}

function useSuspenseItem<Path extends GetPath>(path: Path, init: GetInit<Path>) {
  return $api.useSuspenseQuery("get", path, init);
}

function useIndexedItem<Path extends GetPath>(path: Path, init: FetchOptions<Paths[Path]["get"]>) {
  return $api.useQuery("get", path, init);
}

describe("hook wrappers that type the init as FetchOptions", () => {
  it("queryOptions takes FetchOptions of a generic path", () => {
    const options = itemOptions("/items/{id}", { params: { path: { id: 1 } } });

    expect(options.queryKey).toEqual([
      "get",
      "/items/{id}",
      { params: { path: { id: 1 } }, baseUrl: BASE_URL },
    ]);
  });

  it("useQuery, useSuspenseQuery and an indexed init type the data of the path", () => {
    expectTypeOf<ReturnType<typeof useItem<"/items/{id}">>["data"]>().toEqualTypeOf<
      Item | undefined
    >();
    expectTypeOf<ReturnType<typeof useSuspenseItem<"/items">>["data"]>().toEqualTypeOf<Item[]>();
    expectTypeOf<ReturnType<typeof useIndexedItem<"/items">>["data"]>().toEqualTypeOf<
      Item[] | undefined
    >();
  });

  it("a wrapper still checks the init of the path it is called with", () => {
    // @ts-expect-error "/items/{id}" needs its path parameter
    expect(() => itemOptions("/items/{id}", {})).toBeDefined();
  });
});
