import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import createFetchClient from "openapi-typesafe-fetch";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";

/**
 * A non-OK response with an empty body gives `error: undefined` in the fetch client; it is still a
 * failure (upstream #2070, #2829, ADR-013). A falsy error body (`0`) is a failure too.
 */

type Operation = {
  responses: {
    200: { content: { "application/json": { items: number[] } } };
    500: { content: { "application/json": number } };
  };
};
type Paths = { "/items": { get: Operation; post: Operation } };

const BASE_URL = "https://api.example.com";
const SERVER_ERROR = 500;

function clientAnswering(response: () => Response) {
  const fetchClient = createFetchClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async () => response(),
  });
  return createClient(fetchClient);
}

function emptyError(): Response {
  return new Response(null, { status: SERVER_ERROR, headers: { "Content-Length": "0" } });
}

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("non-OK responses without an error body", () => {
  it("queryFn of an empty error response rejects", async () => {
    const client = clientAnswering(emptyError);

    const query = createQueryClient().fetchQuery(client.queryOptions("get", "/items"));

    await expect(query).rejects.toBeUndefined();
  });

  it("queryFn of a falsy error body rejects with that body", async () => {
    const client = clientAnswering(() => Response.json(0, { status: SERVER_ERROR }));

    const query = createQueryClient().fetchQuery(client.queryOptions("get", "/items"));

    await expect(query).rejects.toBe(0);
  });

  it("mutationFn of an empty error response rejects", async () => {
    const client = clientAnswering(emptyError);
    const { result } = renderHook(() => client.useMutation("post", "/items"), {
      wrapper: wrapperFor(createQueryClient()),
    });

    await expect(result.current.mutateAsync({})).rejects.toBeUndefined();
  });

  it("useInfiniteQuery of an empty error response ends in the error state", async () => {
    const client = clientAnswering(emptyError);
    const options = { getNextPageParam: () => undefined, initialPageParam: 0 };

    const { result } = renderHook(() => client.useInfiniteQuery("get", "/items", {}, options), {
      wrapper: wrapperFor(createQueryClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
