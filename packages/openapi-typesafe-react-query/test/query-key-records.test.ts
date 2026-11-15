// @vitest-environment node
// Node's own Request: jsdom's does not reach Node's fetch types.
import { dehydrate, hashKey, hydrate, QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";
import { queryKeyInit } from "../src/query-key.js";

/**
 * Records that are not object literals, header names in two letter cases, and functions in the
 * init. A key must name what the fetch client sends, and a filter with the key of a query must
 * find it, also after a JSON round trip.
 */

const NO_BASE_URL = { baseUrl: "" };
const BASE_URL = "https://api.example.com";
const DAY_MS = 86_400_000;
const PAGE_SIZE = 5n;
const LIMIT = 10;

/** A parameter DTO: a class instance whose members are the parameters. */
class Filters {
  constructor(members: object) {
    Object.assign(this, members);
  }
}

/** The key init of a request with this init. */
function keyOf(init: object): object | undefined {
  return queryKeyInit(init, NO_BASE_URL);
}

/** The hash TanStack Query gives the key init of a request with this init. */
function initHash(init: object): string {
  return hashKey([keyOf(init)]);
}

type Paths = {
  "/pets": {
    get: {
      parameters: { query?: { limit?: number } };
      responses: { 200: { content: { "application/json": string } } };
    };
  };
};

/** A client whose server answers every request with the same text. */
function petClient() {
  return createClient(
    createFetchClient<Paths>({
      baseUrl: BASE_URL,
      fetch: async () => Response.json("pets"),
    }),
  );
}

describe("queryKeyInit records that are not object literals", () => {
  it("queryKeyInit with a class instance query keys NaN apart from null", () => {
    const withNaN = { params: { query: new Filters({ n: Number.NaN }) } };
    const withNull = { params: { query: new Filters({ n: null }) } };

    expect(initHash(withNaN)).not.toBe(initHash(withNull));
    expect(keyOf(withNaN)).toEqual({ params: { query: { n: { "(number)": "NaN" } } } });
  });

  it("queryKeyInit with a class instance query keys a bigint by its text", () => {
    const init = { params: { query: new Filters({ size: PAGE_SIZE }) } };

    expect(() => initHash(init)).not.toThrow();
    expect(keyOf(init)).toEqual({ params: { query: { size: { "(number)": "5" } } } });
  });

  it("queryKeyInit with a class instance path keys a date as its ISO text", () => {
    const init = { params: { path: new Filters({ day: new Date(DAY_MS) }) } };

    expect(keyOf(init)).toEqual({ params: { path: { day: new Date(DAY_MS).toISOString() } } });
  });

  it("queryKeyInit with class instance params keys them as an object literal", () => {
    const params = new Filters({ query: { n: Number.POSITIVE_INFINITY } });

    expect(keyOf({ params })).toEqual({ params: { query: { n: { "(number)": "Infinity" } } } });
  });

  it("queryKeyInit with a class instance query of no members has the key of no init", () => {
    expect(keyOf({ params: { query: new Filters({}) } })).toBeUndefined();
  });

  it("queryKeyInit with a class instance header record keys its values as sent", () => {
    const init = { params: { header: new Filters({ "x-n": Number.NaN }) } };

    expect(keyOf(init)).toEqual({ params: { header: { "x-n": { "(number)": "NaN" } } } });
  });
});

describe("queryKeyInit header names in two letter cases", () => {
  it("queryKeyInit with one header in two cases keeps the value set last", () => {
    expect(keyOf({ headers: { "X-A": "1", "x-a": "2" } })).toEqual({ headers: { "x-a": "2" } });
    expect(keyOf({ headers: { "x-a": "2", "X-A": "1" } })).toEqual({ headers: { "x-a": "1" } });
  });

  it("queryKeyInit with a header removed in another case keeps the removal set last", () => {
    expect(keyOf({ headers: { "X-A": "1", "x-a": null } })).toEqual({ headers: { "x-a": null } });
    expect(keyOf({ headers: { "x-a": null, "X-A": "1" } })).toEqual({ headers: { "x-a": "1" } });
  });

  it("queryKeyInit with items appended after a set header joins them into its text", () => {
    expect(keyOf({ headers: { "X-A": "1", "x-a": ["2", "3"] } })).toEqual({
      headers: { "x-a": "1, 2, 3" },
    });
  });

  it("queryKeyInit with items appended after a removed header keeps only the items", () => {
    expect(keyOf({ headers: { "X-A": null, "x-a": ["2"] } })).toEqual({ headers: { "x-a": "2" } });
  });

  it("queryKeyInit with no items appended after a removed header keeps the removal", () => {
    expect(keyOf({ headers: { "X-A": null, "x-a": [] } })).toEqual({ headers: { "x-a": null } });
  });

  it("queryKeyInit with items appended twice keeps the list they add to the client's", () => {
    expect(keyOf({ headers: { "X-A": ["1"], "x-a": ["2"] } })).toEqual({
      headers: { "x-a": ["1", "2"] },
    });
  });

  it("queryKeyInit with an undefined header in another case keeps the header set", () => {
    expect(keyOf({ headers: { "X-A": "1", "x-a": undefined } })).toEqual({
      headers: { "x-a": "1" },
    });
  });

  it("queryKeyInit with header pairs in two cases joins them as Headers does", () => {
    const headers = [
      ["X-A", "1"],
      ["x-a", "2"],
    ];

    expect(keyOf({ headers })).toEqual({ headers: { "x-a": "1, 2" } });
  });

  it("queryKeyInit with a header parameter in two cases keeps the value set last", () => {
    const first = { params: { header: { "X-A": "1", "x-a": "2" } } };
    const second = { params: { header: { "x-a": "2", "X-A": "1" } } };

    expect(keyOf(first)).toEqual({ params: { header: { "x-a": "2" } } });
    expect(keyOf(second)).toEqual({ params: { header: { "x-a": "1" } } });
  });

  it("queryKeyInit with an undefined header parameter in another case keeps the one set", () => {
    const init = { params: { header: { "X-A": "1", "x-a": undefined } } };

    expect(keyOf(init)).toEqual({ params: { header: { "x-a": "1" } } });
  });
});

describe("queryKeyInit functions in the init", () => {
  it("queryKeyInit leaves out a function and the functions of a middleware", () => {
    const init = {
      params: { query: { limit: LIMIT } },
      querySerializer: () => "",
      middleware: [{ onRequest: () => undefined }],
    };

    expect(keyOf(init)).toEqual({ params: { query: { limit: LIMIT } }, middleware: [{}] });
  });

  it("queryKeyInit with an init of only a function has the key of no init", () => {
    expect(keyOf({ fetch: () => undefined })).toBeUndefined();
  });

  it("queryKeyInit keeps other init members as they are", () => {
    expect(keyOf({ parseAs: "text", cache: "no-store" })).toEqual({
      parseAs: "text",
      cache: "no-store",
    });
  });

  it("queryOptions with an inline serializer is found by the key of a later render", async () => {
    const $api = petClient();
    const queryClient = new QueryClient();
    const optionsOf = () =>
      $api.queryOptions("get", "/pets", {
        params: { query: { limit: LIMIT } },
        querySerializer: (query: { limit?: number }) => `limit=${query.limit}`,
      });
    await queryClient.fetchQuery(optionsOf());

    const found = queryClient.getQueriesData({ queryKey: optionsOf().queryKey });

    expect(found).toHaveLength(1);
  });

  it("queryOptions with an inline serializer is found after a JSON round trip", async () => {
    const $api = petClient();
    const queryClient = new QueryClient();
    const options = $api.queryOptions("get", "/pets", { querySerializer: () => "" });
    await queryClient.fetchQuery(options);
    const hydrated = new QueryClient();

    hydrate(hydrated, JSON.parse(JSON.stringify(dehydrate(queryClient))));

    expect(hydrated.getQueriesData({ queryKey: options.queryKey })).toHaveLength(1);
  });
});
