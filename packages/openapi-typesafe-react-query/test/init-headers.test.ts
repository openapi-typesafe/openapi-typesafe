// @vitest-environment node
import { QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";
import { createInitHeadersReader } from "../src/init-headers.js";

/**
 * One-shot header lists are read once, when the hooks get the init, into lists of pairs that every
 * request and the key read again. Any other init is kept as it is.
 */

const NAME = "x-token";
const VALUE = "secret";
const READ_ERROR = "cannot read";

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": { ok: boolean } } } } };
  };
};

function fail(): never {
  throw new Error(READ_ERROR);
}

describe("createInitHeadersReader", () => {
  it("createInitHeadersReader reads map entries into a list of pairs", () => {
    const read = createInitHeadersReader();

    expect(read({ headers: new Map([[NAME, VALUE]]).entries() })).toEqual({
      headers: [[NAME, VALUE]],
    });
  });

  it("createInitHeadersReader gives the same pairs for the same iterator again", () => {
    const read = createInitHeadersReader();
    const headers = new Map([[NAME, VALUE]]).entries();

    const first = read({ headers });
    const second = read({ headers });

    expect(second.headers).toBe(first.headers);
    expect(second.headers).toEqual([[NAME, VALUE]]);
  });

  it("createInitHeadersReader keeps an init without one-shot headers as it is", () => {
    const read = createInitHeadersReader();
    const inits = [
      undefined,
      {},
      { headers: { [NAME]: VALUE } },
      { headers: [[NAME, VALUE]] },
      { headers: new Map([[NAME, VALUE]]) },
      { headers: new Headers({ [NAME]: VALUE }) },
      { headers: "x-token: secret" },
    ];

    for (const init of inits) {
      expect(read(init)).toBe(init);
    }
  });

  it("createInitHeadersReader keeps an init whose headers throw when read", () => {
    const read = createInitHeadersReader();
    const init = Object.defineProperty({}, "headers", { get: fail, enumerable: true });

    expect(read(init)).toBe(init);
  });

  it("createInitHeadersReader keeps headers whose iterator member throws", () => {
    const read = createInitHeadersReader();
    const init = { headers: Object.defineProperty({}, Symbol.iterator, { get: fail }) };

    expect(read(init)).toBe(init);
  });

  it("createInitHeadersReader keeps headers with a get method that are their own iterator", () => {
    const read = createInitHeadersReader();
    const entries = new Map([[NAME, VALUE]]).entries();
    const headers = Object.assign(entries, { get: () => VALUE });
    const init = { headers };

    expect(read(init)).toBe(init);
  });

  it("createInitHeadersReader keeps a pair that is no list for the client to reject", () => {
    const read = createInitHeadersReader();

    expect(read({ headers: ["ab"].values() })).toEqual({ headers: ["ab"] });
  });

  it("createInitHeadersReader reads an array with an iterator as a pair", () => {
    const read = createInitHeadersReader();

    expect(read({ headers: [[NAME, VALUE].values()] })).toEqual({ headers: [[NAME, VALUE]] });
  });
});

describe("queryOptions with one-shot headers that throw when read", () => {
  it("queryOptions with a generator that throws reports the error from every request", async () => {
    function* throwing(): Generator<[string, string]> {
      yield fail();
    }
    let requests = 0;
    const $api = createClient(
      createFetchClient<Paths>({
        baseUrl: "https://api.example.com",
        fetch: async () => {
          requests += 1;
          return Response.json({ ok: true });
        },
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: 1, retryDelay: 0 } },
    });

    const options = $api.queryOptions("get", "/items", { headers: throwing() });

    await expect(queryClient.fetchQuery(options)).rejects.toThrow(READ_ERROR);
    expect(requests).toBe(0);
    expect(options.queryKey).toEqual(["get", "/items", { baseUrl: "https://api.example.com" }]);
  });
});
