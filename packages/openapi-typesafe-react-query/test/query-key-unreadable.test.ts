// @vitest-environment node
// Node's own Request: jsdom's does not reach Node's fetch types.
import { dehydrate, hashKey, hydrate, QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";
import { queryKeyInit } from "../src/query-key.js";

/**
 * Values a key cannot read in full, and `undefined` array items. A key is made while the
 * component renders, so it must never throw: a form it cannot read is left out, and the request
 * reports its own error. An `undefined` item must keep a key of its own through a JSON round trip.
 */

const NO_BASE_URL = { baseUrl: "" };
const BASE_URL = "https://api.example.com";
const READ_ERROR = "cannot read";
const ITEM_ID = 1;

/** A member value that throws for every form a serializer may send besides its members. */
class Unreadable {
  readonly id = ITEM_ID;

  toJSON(): never {
    throw new Error(READ_ERROR);
  }

  toString(): never {
    throw new Error(READ_ERROR);
  }
}

/** A value whose text throws. */
const unreadableText = {
  toString(): never {
    throw new Error(READ_ERROR);
  },
};

/** The key init of a request with this init. */
function keyOf(init: object): object | undefined {
  return queryKeyInit(init, NO_BASE_URL);
}

/** The key init of a request with one query parameter `a`. */
function queryKeyOf(value: unknown): object | undefined {
  return keyOf({ params: { query: { a: value } } });
}

type Paths = {
  "/pets": {
    get: {
      parameters: { query?: { ids?: (number | undefined)[] } };
      responses: { 200: { content: { "application/json": string } } };
    };
    post: {
      requestBody: { content: { "application/json": (number | undefined)[] } };
      responses: { 200: { content: { "application/json": string } } };
    };
  };
};

const $api = createClient(
  createFetchClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async () => Response.json("x"),
  }),
);

/** The number of queries a filter with the key of a query finds after a JSON round trip. */
async function foundAfterRoundTrip(options: {
  readonly queryKey: readonly unknown[];
}): Promise<number> {
  const queryClient = new QueryClient();
  await queryClient.fetchQuery(options as never);
  const hydrated = new QueryClient();
  hydrate(hydrated, JSON.parse(JSON.stringify(dehydrate(queryClient))));
  return hydrated.getQueriesData({ queryKey: options.queryKey }).length;
}

describe("queryKeyInit values it cannot read", () => {
  it("queryKeyInit with a throwing toJSON and toString keeps the members only", () => {
    expect(queryKeyOf(new Unreadable())).toEqual({ params: { query: { a: { id: ITEM_ID } } } });
  });

  it("queryKeyInit with a throwing toISOString keys the value as an object", () => {
    const value = {
      toISOString(): never {
        throw new Error(READ_ERROR);
      },
    };

    expect(() => hashKey([queryKeyOf(value)])).not.toThrow();
  });

  it("queryKeyInit with a throwing getter leaves that member out", () => {
    const value = Object.defineProperty({ id: ITEM_ID }, "broken", {
      enumerable: true,
      get(): never {
        throw new Error(READ_ERROR);
      },
    });

    expect(queryKeyOf(value)).toEqual({ params: { query: { a: { id: ITEM_ID } } } });
  });

  it("queryKeyInit with a member that refers back to its object leaves the reference out", () => {
    const value: Record<string, unknown> = { id: ITEM_ID };
    value.self = value;

    expect(queryKeyOf(value)).toEqual({ params: { query: { a: { id: ITEM_ID } } } });
  });

  it("queryKeyInit with an array that holds itself leaves the item out", () => {
    const list: unknown[] = [ITEM_ID];
    list.push(list);

    expect(queryKeyOf(list)).toEqual(queryKeyOf([ITEM_ID, undefined]));
  });

  it("queryKeyInit with a toJSON that returns its object again ends", () => {
    const value: Record<string, unknown> = { id: ITEM_ID };
    value.toJSON = () => ({ value });

    expect(() => hashKey([queryKeyOf(value)])).not.toThrow();
  });

  it("queryKeyInit with a plain header whose text throws keys its members", () => {
    expect(keyOf({ headers: { "x-a": unreadableText } })).toEqual({ headers: { "x-a": {} } });
  });

  it("queryKeyInit with a header pair whose text throws does not throw", () => {
    expect(() => keyOf({ headers: [["x-a", unreadableText]] })).not.toThrow();
  });
});

describe("queryKeyInit undefined array items", () => {
  it("queryKeyInit keys an undefined parameter item apart from a null one", () => {
    const withUndefined = queryKeyOf([ITEM_ID, undefined]);

    expect(hashKey([withUndefined])).not.toBe(hashKey([queryKeyOf([ITEM_ID, null])]));
    expect(withUndefined).toEqual({
      params: { query: { a: [ITEM_ID, { "(undefined)": true }] } },
    });
  });

  it("queryKeyInit keys a hole and a function item as an undefined item", () => {
    // biome-ignore lint/suspicious/noSparseArray: the hole is what this test checks.
    const withHole = queryKeyOf([ITEM_ID, , ITEM_ID]);

    expect(withHole).toEqual(queryKeyOf([ITEM_ID, undefined, ITEM_ID]));
    expect(queryKeyOf([() => undefined])).toEqual(queryKeyOf([undefined]));
  });

  it("queryKeyInit keys an undefined body item as null, as every body sends it", () => {
    expect(keyOf({ body: [ITEM_ID, undefined] })).toStrictEqual({ body: [ITEM_ID, null] });
  });

  it("queryKeyInit keys a hole in a body as null", () => {
    // biome-ignore lint/suspicious/noSparseArray: the hole is what this test checks.
    expect(keyOf({ body: [ITEM_ID, , ITEM_ID] })).toStrictEqual({ body: [ITEM_ID, null, ITEM_ID] });
  });

  it("queryOptions with an undefined parameter item is found after a JSON round trip", async () => {
    const init = { params: { query: { ids: [ITEM_ID, undefined] } } };

    expect(await foundAfterRoundTrip($api.queryOptions("get", "/pets", init))).toBe(1);
  });

  it("queryOptions with an undefined body item is found after a JSON round trip", async () => {
    const init = { body: [ITEM_ID, undefined] };

    expect(await foundAfterRoundTrip($api.queryOptions("post", "/pets", init))).toBe(1);
  });
});
