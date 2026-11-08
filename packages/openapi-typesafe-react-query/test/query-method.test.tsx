import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import createFetchClient from "openapi-typesafe-fetch";
import type { ReactNode } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient from "../src/index.js";
import type { paths } from "./fixtures/query.js";

/** The OpenAPI 3.2 QUERY method through the hooks (roadmap R2, ADR-020). */

const BASE_URL = "https://api.example.com";

function recordingClient(requests: Request[]) {
  const fetchClient = createFetchClient<paths>({
    baseUrl: BASE_URL,
    fetch: async (request) => {
      requests.push(request);
      return Response.json(["Found"]);
    },
  });
  return createClient(fetchClient);
}

function wrapperWith(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("QUERY method", () => {
  it("useQuery with query sends a QUERY request with the body", async () => {
    const requests: Request[] = [];
    const client = recordingClient(requests);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(
      () => client.useQuery("query", "/posts/search", { body: { text: "a" } }),
      {
        wrapper: wrapperWith(queryClient),
      },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(requests[0]?.method).toBe("QUERY");
    expect(await requests[0]?.json()).toEqual({ text: "a" });
    expectTypeOf(result.current.data).toEqualTypeOf<string[] | undefined>();
  });

  it("queryOptions with query keys the request by method, path and body", () => {
    const client = recordingClient([]);

    const options = client.queryOptions("query", "/posts/search", { body: { text: "a" } });

    expect(options.queryKey).toEqual(["query", "/posts/search", { body: { text: "a" } }]);
    // @ts-expect-error `text` is required
    client.queryOptions("query", "/posts/search", { body: {} });
  });
});
