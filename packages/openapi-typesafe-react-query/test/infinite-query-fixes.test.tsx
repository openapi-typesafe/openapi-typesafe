import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import createFetchClient from "openapi-typesafe-fetch";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";

/** `useInfiniteQuery` fixes of ADR-022: its own query key (#2184) and no page param 0 (#2715). */

type Page = { items: number[]; next?: string };

type Paths = {
  "/items": {
    get: {
      parameters: { query?: { limit?: number; cursor?: string } };
      responses: { 200: { content: { "application/json": Page } } };
    };
  };
};

const BASE_URL = "https://api.example.com";
const FIRST_PAGE: Page = { items: [1, 2], next: "c2" };
const LAST_PAGE: Page = { items: [3] };

/** A client whose fetch answers by cursor and records every request URL. */
function createRecordingClient() {
  const urls: URL[] = [];
  const fetchClient = createFetchClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async (request) => {
      const url = new URL(request.url);
      urls.push(url);
      return Response.json(url.searchParams.get("cursor") === "c2" ? LAST_PAGE : FIRST_PAGE);
    },
  });
  return { client: createClient(fetchClient), urls };
}

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperOf(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const CURSOR_OPTIONS = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (page: Page) => page.next,
};

describe("useInfiniteQuery and useQuery with the same request", () => {
  it("useInfiniteQuery next to useQuery for the same request keeps both caches apart", async () => {
    const { client } = createRecordingClient();
    const init = { params: { query: { limit: 2 } } };

    const { result } = renderHook(
      () => ({
        query: client.useQuery("get", "/items", init),
        infinite: client.useInfiniteQuery("get", "/items", init, CURSOR_OPTIONS),
      }),
      { wrapper: wrapperOf(createQueryClient()) },
    );

    await waitFor(() => expect(result.current.infinite.isSuccess && result.current.query.isSuccess).toBe(true));
    expect(result.current.query.data).toEqual(FIRST_PAGE);
    expect(result.current.infinite.data?.pages).toEqual([FIRST_PAGE]);
  });

  it("useInfiniteQuery uses the query key of queryOptions with an infinite marker", async () => {
    const { client } = createRecordingClient();
    const queryClient = createQueryClient();
    const init = { params: { query: { limit: 2 } } };

    const { result } = renderHook(() => client.useInfiniteQuery("get", "/items", init, CURSOR_OPTIONS), {
      wrapper: wrapperOf(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toEqual([[...client.queryOptions("get", "/items", init).queryKey, "infinite"]]);
  });

  it("invalidating the method and path prefix refetches the infinite query", async () => {
    const { client, urls } = createRecordingClient();
    const queryClient = createQueryClient();
    const { result } = renderHook(() => client.useInfiniteQuery("get", "/items", {}, CURSOR_OPTIONS), {
      wrapper: wrapperOf(queryClient),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await queryClient.invalidateQueries({ queryKey: ["get", "/items"] });

    expect(urls).toHaveLength(2);
  });
});

describe("useInfiniteQuery page param", () => {
  it("useInfiniteQuery with an undefined initialPageParam sends no page param on the first page", async () => {
    const { client, urls } = createRecordingClient();

    const { result } = renderHook(() => client.useInfiniteQuery("get", "/items", {}, CURSOR_OPTIONS), {
      wrapper: wrapperOf(createQueryClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const next = await act(() => result.current.fetchNextPage());

    expect(next.data?.pages).toEqual([FIRST_PAGE, LAST_PAGE]);
    expect(urls.map((url) => url.search)).toEqual(["", "?cursor=c2"]);
  });

  it("useInfiniteQuery without init, as a JavaScript caller may write it, still sends the page", async () => {
    const { client, urls } = createRecordingClient();
    // The types ask for an init; leaving it out must not throw while the page init is built.
    const noInit = undefined as unknown as {};
    const options = { initialPageParam: "c2", getNextPageParam: () => undefined };

    const { result } = renderHook(() => client.useInfiniteQuery("get", "/items", noInit, options), {
      wrapper: wrapperOf(createQueryClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls[0]?.search).toBe("?cursor=c2");
  });

  it("useInfiniteQuery with initialPageParam 0 still sends it", async () => {
    const { client, urls } = createRecordingClient();
    const options = { initialPageParam: 0, getNextPageParam: () => undefined };

    const { result } = renderHook(() => client.useInfiniteQuery("get", "/items", {}, options), {
      wrapper: wrapperOf(createQueryClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls[0]?.search).toBe("?cursor=0");
  });
});
