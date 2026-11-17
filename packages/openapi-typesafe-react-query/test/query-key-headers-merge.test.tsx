import { runInNewContext } from "node:vm";
import { hashKey, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import createFetchClient, { mergeHeaders } from "openapi-typesafe-fetch";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";
import { createInitHeadersReader } from "../src/init-headers.js";
import { queryKeyInit } from "../src/query-key.js";

/**
 * The key reads `headers` by the rule of the fetch client's `mergeHeaders`, which sends them:
 * these tests run both on the same inputs, so the two cannot drift apart. Each input is made
 * anew for each read, since an iterator is used up by one. Every request of a query (the first,
 * a refetch, a retry, the next page, a mutation's retry) sends the headers the key holds.
 */

const NO_BASE_URL = { baseUrl: "" };
const BASE_URL = "https://api.example.com";
const NAME = "x-default";

/** Headers of the client that an init's headers may set, remove or append to. */
const CLIENT_HEADERS: readonly Record<string, string>[] = [{}, { [NAME]: "on", "x-other": "1" }];

function* generatedPairs(...pairs: unknown[][]): Generator<unknown[]> {
  yield* pairs;
}

/** Header inputs by name, each a factory for a fresh value. */
const INPUTS: Readonly<Record<string, () => unknown>> = {
  plain: () => ({ [NAME]: "a" }),
  plainNull: () => ({ [NAME]: null }),
  plainNullText: () => ({ [NAME]: "null" }),
  plainUndefined: () => ({ [NAME]: undefined }),
  plainArray: () => ({ [NAME]: ["a", "b"] }),
  plainCases: () => ({ "X-Default": "a", [NAME]: "b" }),
  map: () => new Map([[NAME, "a"]]),
  mapNull: () => new Map([[NAME, null]]),
  mapNullText: () => new Map([[NAME, "null"]]),
  mapUndefined: () => new Map([[NAME, undefined]]),
  mapUndefinedText: () => new Map([[NAME, "undefined"]]),
  mapArray: () => new Map([[NAME, ["a", "b"]]]),
  mapNumberName: () => new Map([[5, "a"]]),
  mapOtherRealm: () => runInNewContext(`new Map([["${NAME}", null]])`),
  headers: () => new Headers({ [NAME]: "a" }),
  headersEmpty: () => new Headers(),
  searchParams: () => new URLSearchParams({ [NAME]: "a" }),
  pairs: () => [[NAME, "a"]],
  pairsRepeated: () => [
    [NAME, "a"],
    [NAME, "b"],
  ],
  pairsCases: () => [
    ["X-Default", "a"],
    [NAME, "b"],
  ],
  pairsNull: () => [[NAME, null]],
  pairsUndefined: () => [[NAME, undefined]],
  pairsArray: () => [[NAME, ["a", "b"]]],
  pairsEmptyArray: () => [[NAME, []]],
  pairsSetThenRemove: () => [
    [NAME, "a"],
    [NAME, null],
  ],
  pairsRemoveThenSet: () => [
    [NAME, null],
    [NAME, "b"],
  ],
  pairsSetThenArray: () => [
    [NAME, "a"],
    [NAME, ["b", "c"]],
  ],
  pairsArrayThenSet: () => [
    [NAME, ["a"]],
    [NAME, "b"],
  ],
  pairsEmptyArrayThenSet: () => [
    [NAME, []],
    [NAME, "b"],
  ],
  pairsUndefinedThenSet: () => [
    [NAME, undefined],
    [NAME, "b"],
  ],
  pairsInSet: () => new Set([[NAME, "a"]]),
  entries: () => new Map([[NAME, "a"]]).entries(),
  entriesNull: () => new Map([[NAME, null]]).entries(),
  entriesArray: () => new Map([[NAME, ["a", "b"]]]).entries(),
  generator: () => generatedPairs([NAME, "a"]),
  generatorRepeated: () => generatedPairs([NAME, "a"], [NAME, "b"]),
  iteratorPair: () => [[NAME, "a"].values()],
  iteratorPairInSet: () => new Set([[NAME, "a"].values()]),
  iteratorPairInGenerator: () => generatedPairs([NAME, "a"].values() as never),
  notObject: () => "x-default: a",
};

/** The headers a request with these init headers sends, as a sorted list of pairs. */
function sent(client: Record<string, string>, headers: unknown): [string, string][] {
  return Array.from(mergeHeaders(client, headers as Record<string, string>));
}

/** The headers part of the key of a request with these init headers, as the hooks read them. */
function headersKeyOf(headers: unknown): unknown {
  const init = createInitHeadersReader()({ headers });
  return (queryKeyInit(init, NO_BASE_URL) as { headers?: unknown } | undefined)?.headers;
}

describe("queryKeyInit headers by the fetch client's mergeHeaders", () => {
  it.each(Object.keys(INPUTS))("queryKeyInit %s headers send what the key holds", (name) => {
    const make = INPUTS[name] as () => unknown;
    const key = headersKeyOf(make()) ?? {};

    for (const client of CLIENT_HEADERS) {
      expect(sent(client, key)).toEqual(sent(client, make()));
    }
  });

  it("queryKeyInit headers of one key send one request for every pair of inputs", () => {
    const makers = Object.values(INPUTS);
    for (const makeA of makers) {
      for (const makeB of makers.filter(
        (makeB) => hashKey([headersKeyOf(makeA())]) === hashKey([headersKeyOf(makeB())]),
      )) {
        for (const client of CLIENT_HEADERS) {
          expect(sent(client, makeA())).toEqual(sent(client, makeB()));
        }
      }
    }
  });

  it("queryKeyInit with Map headers of null and of the text null gives other keys", () => {
    expect(headersKeyOf(new Map([[NAME, null]]))).not.toEqual(
      headersKeyOf(new Map([[NAME, "null"]])),
    );
  });

  it("queryKeyInit with Map headers of undefined and of its text gives other keys", () => {
    expect(headersKeyOf(new Map([[NAME, undefined]]))).not.toEqual(
      headersKeyOf(new Map([[NAME, "undefined"]])),
    );
  });

  it("queryKeyInit with map entries of other values gives other keys", () => {
    expect(headersKeyOf(new Map([[NAME, "a"]]).entries())).not.toEqual(
      headersKeyOf(new Map([[NAME, "b"]]).entries()),
    );
  });

  it("queryKeyInit with text headers, which the client skips, has the key of none", () => {
    expect(queryKeyInit({ headers: "x-default: a" }, NO_BASE_URL)).toBeUndefined();
  });

  it("queryKeyInit with Headers that repeat a name keeps the last value, as the client sets", () => {
    const headers = new Headers([
      ["set-cookie", "a=1"],
      ["set-cookie", "b=2"],
    ]);

    expect(headersKeyOf(headers)).toEqual({ "set-cookie": "b=2" });
  });
});

describe("queryKeyInit headers it could use up", () => {
  it("queryKeyInit with map.entries() headers not read by the hooks leaves them out", () => {
    const headers = new Map([[NAME, "a"]]).entries();

    expect(queryKeyInit({ headers }, NO_BASE_URL)).toBeUndefined();
    expect(sent({}, headers)).toEqual([[NAME, "a"]]);
  });

  it("queryKeyInit with an iterator as a header pair not read by the hooks leaves it out", () => {
    const headers = [[NAME, "a"].values()];

    expect(queryKeyInit({ headers }, NO_BASE_URL)).toBeUndefined();
    expect(sent({}, headers)).toEqual([[NAME, "a"]]);
  });

  it("queryKeyInit with headers of a get method and no collection leaves them out", () => {
    let reads = 0;
    const headers = {
      get: (): null => null,
      entries: (): Iterator<[string, string]> => {
        reads += 1;
        return [[NAME, "a"] as [string, string]].values();
      },
    };

    expect(headersKeyOf(headers)).toBeUndefined();
    expect(reads).toBe(0);
  });
});

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": { next?: number } } } } };
    post: { responses: { 200: { content: { "application/json": { next?: number } } } } };
  };
};

/** A query client and hooks whose fetch fails the first `failures` requests and records all. */
function recordingHooks(clientHeaders: Record<string, string>, failures: number) {
  const requests: [string, string][][] = [];
  let failuresLeft = failures;
  const fetchClient = createFetchClient<Paths>({
    baseUrl: BASE_URL,
    headers: clientHeaders,
    fetch: async (request) => {
      requests.push(Array.from(request.headers));
      failuresLeft -= 1;
      return failuresLeft >= 0
        ? Response.json({}, { status: 503 })
        : Response.json({ next: requests.length });
    },
  });
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: 1, retryDelay: 0 },
      mutations: { retry: 1, retryDelay: 0 },
    },
  });
  return { $api: createClient(fetchClient), queryClient, requests };
}

function wrapperOf(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** The requests of a query that fails once, is retried and then refetched. */
async function queryRequests(client: Record<string, string>, headers: unknown) {
  const { $api, queryClient, requests } = recordingHooks(client, 1);
  const options = $api.queryOptions("get", "/items", { headers } as never);
  await queryClient.fetchQuery(options);
  await queryClient.refetchQueries({ queryKey: options.queryKey });
  return { requests, key: options.queryKey };
}

/** The requests of an infinite query's first page, retried once, and of its next page. */
async function infiniteRequests(client: Record<string, string>, make: () => unknown) {
  const { $api, queryClient, requests } = recordingHooks(client, 1);
  const headers = make();
  const { result } = renderHook(
    () =>
      $api.useInfiniteQuery("get", "/items", { headers } as never, {
        initialPageParam: 0,
        getNextPageParam: (page: { next?: number }) => page.next,
      }),
    { wrapper: wrapperOf(queryClient) },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await act(() => result.current.fetchNextPage());
  return requests;
}

/** The requests of a mutation that fails once and is retried. */
async function mutationRequests(client: Record<string, string>, headers: unknown) {
  const { $api, queryClient, requests } = recordingHooks(client, 1);
  const { result } = renderHook(() => $api.useMutation("post", "/items"), {
    wrapper: wrapperOf(queryClient),
  });
  await act(() => result.current.mutateAsync({ headers } as never));
  return requests;
}

describe("every request of a query sends the headers of its key", () => {
  it.each(Object.keys(INPUTS))("queryOptions %s headers: first, retry, refetch", async (name) => {
    const make = INPUTS[name] as () => unknown;
    for (const client of CLIENT_HEADERS) {
      const { requests, key } = await queryRequests(client, make());
      const keyHeaders = (key[2] as { headers?: unknown } | undefined)?.headers ?? {};

      expect(requests).toHaveLength(3);
      for (const request of requests) {
        expect(request).toEqual(sent(client, make()));
        expect(request).toEqual(sent(client, keyHeaders));
      }
    }
  });

  it.each(Object.keys(INPUTS))("useInfiniteQuery %s headers: every page", async (name) => {
    const make = INPUTS[name] as () => unknown;
    for (const client of CLIENT_HEADERS) {
      const requests = await infiniteRequests(client, make);

      expect(requests).toHaveLength(3);
      for (const request of requests) {
        expect(request).toEqual(sent(client, make()));
      }
    }
  });

  it.each(Object.keys(INPUTS))("useMutation %s headers: first and retry", async (name) => {
    const make = INPUTS[name] as () => unknown;
    for (const client of CLIENT_HEADERS) {
      const requests = await mutationRequests(client, make());

      expect(requests).toHaveLength(2);
      for (const request of requests) {
        expect(request).toEqual(sent(client, make()));
      }
    }
  });
});
