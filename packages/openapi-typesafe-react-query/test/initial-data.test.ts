import { useQuery } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expectTypeOf, it } from "vitest";
import createClient from "../src/index.js";

/** `data` of a query with `initialData`, which TanStack Query types as never `undefined`. */

type Item = { id: number };
type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": Item[] } } } };
  };
};

const $api = createClient(createFetchClient<Paths>({ baseUrl: "https://api.example.com" }));
const ITEMS: Item[] = [];

function useWithValue() {
  return $api.useQuery("get", "/items", {}, { initialData: ITEMS });
}

function useWithFunction() {
  return $api.useQuery("get", "/items", {}, { initialData: () => ITEMS });
}

function useWithMaybeUndefined() {
  return $api.useQuery("get", "/items", {}, { initialData: () => ITEMS.at(0) && ITEMS });
}

function useWithSelect() {
  return $api.useQuery("get", "/items", {}, { initialData: ITEMS, select: (data) => data.length });
}

function useWithoutInitialData() {
  return $api.useQuery("get", "/items");
}

function useTanStackWithOptions() {
  return useQuery($api.queryOptions("get", "/items", {}, { initialData: ITEMS }));
}

describe("initialData", () => {
  it("useQuery with a defined initialData value or function has defined data", () => {
    expectTypeOf<ReturnType<typeof useWithValue>["data"]>().toEqualTypeOf<Item[]>();
    expectTypeOf<ReturnType<typeof useWithFunction>["data"]>().toEqualTypeOf<Item[]>();
    expectTypeOf<ReturnType<typeof useWithSelect>["data"]>().toEqualTypeOf<number>();
  });

  it("useQuery without initialData, or with one that may be undefined, may have no data", () => {
    expectTypeOf<ReturnType<typeof useWithMaybeUndefined>["data"]>().toEqualTypeOf<
      Item[] | undefined
    >();
    expectTypeOf<ReturnType<typeof useWithoutInitialData>["data"]>().toEqualTypeOf<
      Item[] | undefined
    >();
  });

  it("TanStack's useQuery with queryOptions that give initialData has defined data", () => {
    expectTypeOf<ReturnType<typeof useTanStackWithOptions>["data"]>().toEqualTypeOf<Item[]>();
  });
});
