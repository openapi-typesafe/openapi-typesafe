import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { renderToString } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient from "../src/index.js";

/**
 * Query keys and the query cache (pre-beta test plan 7.2, 7.3 and 7.6): keys are stable and unique
 * per params, a `[method, path]` prefix invalidates every variant, the typed key works with
 * `getQueryData` / `setQueryData`, cancelling aborts the request, and a dehydrated query renders on
 * the server without a request.
 */

type Item = { id: number };
type Paths = {
  "/items": {
    get: {
      parameters: { query?: { page?: number; size?: number } };
      responses: { 200: { content: { "application/json": Item[] } } };
    };
  };
};

const BASE_URL = "https://api.example.com";

function clientRecording(urls: string[], answer = (): Response => Response.json([{ id: 1 }])) {
  const fetchClient = createFetchClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async (request) => {
      urls.push(request.url);
      return answer();
    },
  });
  return createClient(fetchClient);
}

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("query keys and cache", () => {
  it("queryOptions with the same params in another key order reads the cached data", async () => {
    const urls: string[] = [];
    const client = clientRecording(urls);
    const queryClient = createQueryClient();
    await queryClient.fetchQuery(
      client.queryOptions("get", "/items", { params: { query: { page: 1, size: 2 } } }),
    );

    const reordered = client.queryOptions("get", "/items", {
      params: { query: { size: 2, page: 1 } },
    });

    expect(queryClient.getQueryData(reordered.queryKey)).toEqual([{ id: 1 }]);
    expect(urls).toHaveLength(1);
  });

  it("queryOptions with other params has another key", async () => {
    const urls: string[] = [];
    const client = clientRecording(urls);
    const queryClient = createQueryClient();

    for (const page of [1, 2]) {
      await queryClient.fetchQuery(
        client.queryOptions("get", "/items", { params: { query: { page } } }),
      );
    }

    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
    expect(urls).toHaveLength(2);
  });

  it("invalidateQueries with the method and path invalidates every params variant", async () => {
    const client = clientRecording([]);
    const queryClient = createQueryClient();
    const pages = [1, 2].map((page) =>
      client.queryOptions("get", "/items", { params: { query: { page } } }),
    );
    await Promise.all(pages.map((options) => queryClient.fetchQuery(options)));

    await queryClient.invalidateQueries({ queryKey: ["get", "/items"], refetchType: "none" });

    const states = pages.map((options) => queryClient.getQueryState(options.queryKey));
    expect(states.map((state) => state?.isInvalidated)).toEqual([true, true]);
  });

  it("the typed key gives the response type to getQueryData and setQueryData", () => {
    const client = clientRecording([]);
    const queryClient = createQueryClient();
    const { queryKey } = client.queryOptions("get", "/items");

    queryClient.setQueryData(queryKey, [{ id: 2 }]);

    expectTypeOf(queryClient.getQueryData(queryKey)).toEqualTypeOf<Item[] | undefined>();
    expect(queryClient.getQueryData(queryKey)).toEqual([{ id: 2 }]);
  });

  it("cancelQueries aborts the request", async () => {
    let signal: AbortSignal | undefined;
    const fetchClient = createFetchClient<Paths>({
      baseUrl: BASE_URL,
      fetch: (request) => {
        signal = request.signal;
        return new Promise<Response>(() => undefined);
      },
    });
    const queryClient = createQueryClient();
    const options = createClient(fetchClient).queryOptions("get", "/items");
    void queryClient.prefetchQuery(options);
    await expect.poll(() => signal).toBeDefined();

    await queryClient.cancelQueries({ queryKey: options.queryKey });

    expect(signal?.aborted).toBe(true);
  });
});

describe("server rendering", () => {
  it("queries that differ only in a Headers object or header pairs have their own keys", async () => {
    const tenants: (string | null)[] = [];
    const fetchClient = createFetchClient<Paths>({
      baseUrl: BASE_URL,
      fetch: async (request) => {
        tenants.push(request.headers.get("x-tenant"));
        return Response.json([{ id: tenants.length }]);
      },
    });
    const client = createClient(fetchClient);
    const queryClient = createQueryClient();
    const tenantA = client.queryOptions("get", "/items", {
      headers: new Headers({ "X-Tenant": "a" }),
    });
    const tenantB = client.queryOptions("get", "/items", { headers: [["X-Tenant", "b"]] });

    await queryClient.fetchQuery(tenantA);
    await queryClient.fetchQuery(tenantB);

    expect(tenants).toEqual(["a", "b"]);
    expect(tenantB.queryKey).toEqual([
      "get",
      "/items",
      { headers: { "x-tenant": "b" }, baseUrl: BASE_URL },
    ]);
    expect(queryClient.getQueryData(tenantB.queryKey)).toEqual([{ id: 2 }]);
  });

  it("queries of two clients with different base URLs have their own keys", async () => {
    const urls: string[] = [];
    const record = async (request: Request) => {
      urls.push(request.url);
      return Response.json([{ id: urls.length }]);
    };
    const first = createClient(createFetchClient<Paths>({ baseUrl: BASE_URL, fetch: record }));
    const second = createClient(
      createFetchClient<Paths>({ baseUrl: "https://other.example.com", fetch: record }),
    );
    const queryClient = createQueryClient();

    await queryClient.fetchQuery(first.queryOptions("get", "/items"));
    const data = await queryClient.fetchQuery(second.queryOptions("get", "/items"));

    expect(urls).toEqual([`${BASE_URL}/items`, "https://other.example.com/items"]);
    expect(data).toEqual([{ id: 2 }]);
  });

  it("each query sends its own init: a fetch of the call is not taken from the key", async () => {
    const queryClient = createQueryClient();
    const client = createClient(createFetchClient<Paths>({ baseUrl: BASE_URL }));
    const answering = (id: number) => async () => Response.json([{ id }]);

    const options = client.queryOptions("get", "/items", { fetch: answering(7) });

    expect(await queryClient.fetchQuery(options)).toEqual([{ id: 7 }]);
  });

  it("cancelQueries aborts a request whose init has its own signal", async () => {
    let signal: AbortSignal | undefined;
    const fetchClient = createFetchClient<Paths>({
      baseUrl: BASE_URL,
      fetch: (request) => {
        signal = request.signal;
        return new Promise<Response>(() => undefined);
      },
    });
    const queryClient = createQueryClient();
    const own = new AbortController();
    const options = createClient(fetchClient).queryOptions("get", "/items", { signal: own.signal });
    void queryClient.prefetchQuery(options);
    await expect.poll(() => signal).toBeDefined();

    await queryClient.cancelQueries({ queryKey: options.queryKey });

    expect(signal?.aborted).toBe(true);
    expect(own.signal.aborted).toBe(false);
  });

  it("a dehydrated query renders on the server without a request", async () => {
    const serverUrls: string[] = [];
    const serverClient = createQueryClient();
    const options = clientRecording(serverUrls).queryOptions("get", "/items");
    await serverClient.prefetchQuery(options);
    const state = dehydrate(serverClient);
    const renderUrls: string[] = [];
    const renderClient = clientRecording(renderUrls);
    function Items() {
      const { data } = useQuery(renderClient.queryOptions("get", "/items"));
      return <p>{data?.map((item) => item.id).join(",")}</p>;
    }

    const html = renderToString(
      <QueryClientProvider client={createQueryClient()}>
        <HydrationBoundary state={state}>
          <Items />
        </HydrationBoundary>
      </QueryClientProvider>,
    );

    expect(html).toBe("<p>1</p>");
    expect(serverUrls).toHaveLength(1);
    expect(renderUrls).toHaveLength(0);
  });
});
