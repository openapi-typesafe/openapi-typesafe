import createFetchClient from "openapi-typesafe-fetch";
import { describe, expectTypeOf, it } from "vitest";
import createClient from "../src/index.js";

/**
 * The page param type comes from `initialPageParam` and the return types of `getNextPageParam`
 * and `getPreviousPageParam`; it was `unknown` (upstream #2458, PR #2459). Code that compiled with
 * `unknown` still compiles. Type checks: `tsc` runs them, the hooks are never called.
 */

type Page = { items: string[]; nextCursor?: string; nextPage?: number };
type Paths = {
  "/items": {
    get: {
      parameters: { query?: { cursor?: string; page?: number } };
      responses: { 200: { content: { "application/json": Page } } };
    };
  };
};

const $api = createClient(createFetchClient<Paths>({ baseUrl: "https://api.example.com" }));

type PageParamsOf<Query extends () => { data: unknown }> =
  NonNullable<ReturnType<Query>["data"]> extends {
    pageParams: (infer PageParam)[];
  }
    ? PageParam
    : never;

describe("useInfiniteQuery page param type", () => {
  it("a page number API gets number page params", () => {
    const query = () =>
      $api.useInfiniteQuery(
        "get",
        "/items",
        {},
        { initialPageParam: 0, getNextPageParam: (last) => last.nextPage },
      );

    expectTypeOf<PageParamsOf<typeof query>>().toEqualTypeOf<number>();
  });

  it("placeholderData keeps the previous data with typed page params", () => {
    const query = () =>
      $api.useInfiniteQuery(
        "get",
        "/items",
        {},
        {
          initialPageParam: "",
          getNextPageParam: (last) => last.nextCursor,
          placeholderData: (previous) => previous,
        },
      );

    expectTypeOf<PageParamsOf<typeof query>>().toEqualTypeOf<string>();
  });

  it("select compiles and gets unknown page params, as TypeScript types it before inferring them", () => {
    const query = () =>
      $api.useInfiniteQuery(
        "get",
        "/items",
        {},
        { initialPageParam: 0, getNextPageParam: (last) => last.nextPage, select: (data) => data },
      );

    expectTypeOf<PageParamsOf<typeof query>>().toEqualTypeOf<unknown>();
  });

  it("a cursor API with an undefined initialPageParam gets the cursor or undefined", () => {
    const query = () =>
      $api.useInfiniteQuery(
        "get",
        "/items",
        {},
        { initialPageParam: undefined, getNextPageParam: (last) => last.nextCursor },
      );

    expectTypeOf<PageParamsOf<typeof query>>().toEqualTypeOf<string | undefined>();
  });

  it("getPreviousPageParam adds its return type", () => {
    const query = () =>
      $api.useInfiniteQuery(
        "get",
        "/items",
        {},
        {
          initialPageParam: 1,
          getNextPageParam: (last) => last.nextPage,
          getPreviousPageParam: (first) => first.nextCursor,
        },
      );

    expectTypeOf<PageParamsOf<typeof query>>().toEqualTypeOf<number | string>();
  });

  it("an annotated lastPageParam of the page param type compiles", () => {
    const query = () =>
      $api.useInfiniteQuery(
        "get",
        "/items",
        {},
        {
          initialPageParam: 0,
          getNextPageParam: (_last, _all, lastPageParam: number) => lastPageParam + 1,
        },
      );

    expectTypeOf<PageParamsOf<typeof query>>().toEqualTypeOf<number>();
  });

  it("a return computed from an unannotated lastPageParam keeps the page param unknown", () => {
    const query = () =>
      $api.useInfiniteQuery(
        "get",
        "/items",
        {},
        {
          initialPageParam: 0,
          getNextPageParam: (_last, _all, lastPageParam) => {
            expectTypeOf(lastPageParam).toEqualTypeOf<unknown>();
            return lastPageParam;
          },
        },
      );

    expectTypeOf<PageParamsOf<typeof query>>().toEqualTypeOf<unknown>();
  });

  it("an undefined initialPageParam and no typed return keep the page param unknown", () => {
    const options = { initialPageParam: undefined, getNextPageParam: () => undefined };
    const query = () => $api.useInfiniteQuery("get", "/items", {}, options);

    expectTypeOf<PageParamsOf<typeof query>>().toEqualTypeOf<unknown>();
  });

  it("getNextPageParam is required", () => {
    // @ts-expect-error: TanStack Query needs getNextPageParam to fetch the next page.
    const query = () => $api.useInfiniteQuery("get", "/items", {}, { initialPageParam: 0 });

    expectTypeOf(query).toBeFunction();
  });
});
