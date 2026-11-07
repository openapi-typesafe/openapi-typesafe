import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import createFetchClient from "openapi-typesafe-fetch";
import type { ReactNode } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient from "../src/index.js";

/**
 * A successful response without a body gives `data: undefined` in the fetch client, which TanStack
 * Query rejects ("Query data cannot be undefined"). Only a 204 and `Content-Length: 0` became `null`;
 * an empty chunked body and every HEAD response did not (upstream #2234).
 */

type Item = { id: number };
type Operation = {
  responses: {
    200: { content: { "application/json": Item } };
    204: { content?: never };
  };
};
type Paths = { "/items": { get: Operation; head: Operation; post: Operation } };

const BASE_URL = "https://api.example.com";
const OK = 200;
const NO_CONTENT = 204;
const PAGE_OPTIONS = { getNextPageParam: () => undefined, initialPageParam: 0 };

function createWrapper() {
  const queryClient = createQueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function clientAnswering(response: () => Response) {
  const fetchClient = createFetchClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async () => response(),
  });
  return createClient(fetchClient);
}

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("successful responses without a body", () => {
  it("queryFn of an empty body without Content-Length resolves to null", async () => {
    const client = clientAnswering(() => new Response(null, { status: OK }));

    const data = await createQueryClient().fetchQuery(client.queryOptions("get", "/items"));

    expect(data).toBeNull();
  });

  it("queryFn of a HEAD request resolves to null", async () => {
    const client = clientAnswering(() => Response.json({ id: 1 }, { status: OK }));

    const data = await createQueryClient().fetchQuery(client.queryOptions("head", "/items"));

    expect(data).toBeNull();
  });

  it("queryFn of a 204 resolves to null", async () => {
    const client = clientAnswering(() => new Response(null, { status: NO_CONTENT }));

    const data = await createQueryClient().fetchQuery(client.queryOptions("get", "/items"));

    expect(data).toBeNull();
  });

  it("useInfiniteQuery of an empty page keeps an undefined page, as in upstream", async () => {
    const client = clientAnswering(() => new Response(null, { status: NO_CONTENT }));

    const { result } = renderHook(
      () => client.useInfiniteQuery("get", "/items", {}, PAGE_OPTIONS),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toEqual([undefined]);
  });

  it("useMutation of a 204 resolves to undefined, as in upstream", async () => {
    const client = clientAnswering(() => new Response(null, { status: NO_CONTENT }));

    const { result } = renderHook(() => client.useMutation("post", "/items"), {
      wrapper: createWrapper(),
    });
    const data = await act(() => result.current.mutateAsync({}));

    expect(data).toBeUndefined();
  });

  it("queryFn of a body resolves to the parsed body", async () => {
    const client = clientAnswering(() => Response.json({ id: 1 }, { status: OK }));

    const data = await createQueryClient().fetchQuery(client.queryOptions("get", "/items"));

    expect(data).toEqual({ id: 1 });
  });
});

/**
 * The query data types say `null` where `queryFn` gives it: a 204 was typed `undefined`, a value
 * the query never holds (upstream #2464). Type checks: `tsc` runs them, the hooks are not called.
 */
describe("query data types of responses without a body", () => {
  type Paths = {
    "/items": { get: Operation };
    "/ping": {
      get: { responses: { 204: { content?: never } } };
      post: { responses: { 204: { content?: never } } };
    };
    "/item": { get: { responses: { 200: { content: { "application/json": Item } } } } };
  };
  const $api = createClient(createFetchClient<Paths>({ baseUrl: BASE_URL }));

  it("queryOptions data of a 200 or 204 operation is the body or null", () => {
    const query = () => createQueryClient().fetchQuery($api.queryOptions("get", "/items"));

    expectTypeOf<ReturnType<typeof query>>().toEqualTypeOf<Promise<Item | null>>();
  });

  it("useQuery and useSuspenseQuery data of a 204 operation is null", () => {
    const query = () => $api.useQuery("get", "/ping");
    const suspense = () => $api.useSuspenseQuery("get", "/ping");

    expectTypeOf<ReturnType<typeof query>["data"]>().toEqualTypeOf<null | undefined>();
    expectTypeOf<ReturnType<typeof suspense>["data"]>().toEqualTypeOf<null>();
  });

  it("useQuery data of a 200 operation has no null", () => {
    const query = () => $api.useQuery("get", "/item");

    expectTypeOf<ReturnType<typeof query>["data"]>().toEqualTypeOf<Item | undefined>();
  });

  it("useInfiniteQuery pages of a 200 or 204 operation are the body or undefined, the value queryFn gives", () => {
    const query = () => $api.useInfiniteQuery("get", "/items", {}, PAGE_OPTIONS);

    expectTypeOf<NonNullable<ReturnType<typeof query>["data"]>["pages"]>().toEqualTypeOf<
      (Item | undefined)[]
    >();
  });

  it("useMutation data of a 204 operation is undefined, the value mutationFn gives", () => {
    const mutation = () => $api.useMutation("post", "/ping");

    expectTypeOf<
      Awaited<ReturnType<ReturnType<typeof mutation>["mutateAsync"]>>
    >().toEqualTypeOf<undefined>();
  });

  it("select of a 200 or 204 operation gets the body or null", () => {
    const query = () =>
      $api.useQuery("get", "/items", undefined, {
        select: (data) => {
          expectTypeOf(data).toEqualTypeOf<Item | null>();
          return data?.id;
        },
      });

    expectTypeOf<ReturnType<typeof query>["data"]>().toEqualTypeOf<number | undefined>();
  });
});
