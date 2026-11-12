import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import createFetchClient from "openapi-typesafe-fetch";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";

/**
 * `pageParamName` names the query parameter of each page, so two infinite queries that differ only
 * in it send different requests and must not share one cache entry.
 */

type Page = { items: string[] };

type Paths = {
  "/items": {
    get: {
      parameters: { query?: { limit?: number; cursor?: string; page?: string } };
      responses: { 200: { content: { "application/json": Page } } };
    };
  };
};

const BASE_URL = "https://api.example.com";
const INIT = { params: { query: { limit: 5 } } };
const PAGE_OPTIONS = { initialPageParam: "1", getNextPageParam: () => undefined };

/** A client whose fetch answers with the name of the page parameter the request has. */
function createNamingClient() {
  const fetchClient = createFetchClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async (request) => {
      const { searchParams } = new URL(request.url);
      return Response.json({ items: [searchParams.has("page") ? "page" : "cursor"] });
    },
  });
  return createClient(fetchClient);
}

/** A QueryClient and a wrapper that provides it. */
function createCache() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useInfiniteQuery pageParamName in the query key", () => {
  it("useInfiniteQuery with another pageParamName gets its own pages", async () => {
    const client = createNamingClient();
    const { wrapper } = createCache();

    const { result } = renderHook(
      () => ({
        byCursor: client.useInfiniteQuery("get", "/items", INIT, PAGE_OPTIONS),
        byPage: client.useInfiniteQuery("get", "/items", INIT, {
          ...PAGE_OPTIONS,
          pageParamName: "page",
        }),
      }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.byCursor.isSuccess && result.current.byPage.isSuccess).toBe(true),
    );
    expect(result.current.byCursor.data?.pages).toEqual([{ items: ["cursor"] }]);
    expect(result.current.byPage.data?.pages).toEqual([{ items: ["page"] }]);
  });

  it("useInfiniteQuery keys the default pageParamName as no pageParamName", async () => {
    const client = createNamingClient();
    const { queryClient, wrapper } = createCache();
    const { queryKey } = client.queryOptions("get", "/items", INIT);

    const { result } = renderHook(
      () => ({
        named: client.useInfiniteQuery("get", "/items", INIT, {
          ...PAGE_OPTIONS,
          pageParamName: "cursor",
        }),
        other: client.useInfiniteQuery("get", "/items", INIT, {
          ...PAGE_OPTIONS,
          pageParamName: "page",
        }),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.other.isSuccess).toBe(true));
    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .map((query) => query.queryKey),
    ).toEqual([
      [...queryKey, "infinite"],
      [...queryKey, "infinite", { pageParamName: "page" }],
    ]);
  });
});
