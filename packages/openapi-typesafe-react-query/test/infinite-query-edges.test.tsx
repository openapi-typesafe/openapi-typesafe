import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import createFetchClient from "openapi-typesafe-fetch";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";

/** `useInfiniteQuery` without request params, and with an error response. */

type Paths = {
  "/items": {
    get: {
      responses: {
        200: { content: { "application/json": { items: number[] } } };
        500: { content: { "application/json": { code: number } } };
      };
    };
  };
};

const BASE_URL = "https://api.example.com";
const SERVER_ERROR = 500;

/** A client whose fetch answers every request with `response` and records the request URL. */
function createRecordingClient(response: () => Response) {
  const urls: URL[] = [];
  const fetchClient = createFetchClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async (request) => {
      urls.push(new URL(request.url));
      return response();
    },
  });
  return { client: createClient(fetchClient), urls };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const PAGE_OPTIONS = { getNextPageParam: () => undefined, initialPageParam: 0 };

describe("useInfiniteQuery edge cases", () => {
  it("useInfiniteQuery without params sends only the page param", async () => {
    const { client, urls } = createRecordingClient(() => Response.json({ items: [1] }));

    const { result } = renderHook(
      () => client.useInfiniteQuery("get", "/items", {}, PAGE_OPTIONS),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls[0]?.search).toBe("?cursor=0");
    expect(result.current.data?.pages).toEqual([{ items: [1] }]);
  });

  it("useInfiniteQuery with an error response fails with the error body", async () => {
    const { client } = createRecordingClient(() =>
      Response.json({ code: SERVER_ERROR }, { status: SERVER_ERROR }),
    );

    const { result } = renderHook(
      () => client.useInfiniteQuery("get", "/items", {}, PAGE_OPTIONS),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ code: SERVER_ERROR });
  });
});
