// @vitest-environment node
// Node's own Request: jsdom's does not reach Node's fetch types.
import { dehydrate, hashKey, hydrate, QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";
import { queryKeyInit } from "../src/query-key.js";

/**
 * One rule reads every value into a key, in a body as in `params` and `headers`: a function is
 * left out, a reference back to an object the walk is inside of is left out, and a value that
 * throws while it is read is left out instead of crashing the component while it renders.
 */

const NO_BASE_URL = { baseUrl: "" };
const BASE_URL = "https://api.example.com";
const READ_ERROR = "cannot read";
const ITEM_ID = 1;
const TERM = "cat";

/** The key init of a request with this init. */
function keyOf(init: object): object | undefined {
  return queryKeyInit(init, NO_BASE_URL);
}

/** Throws the read error, as a getter, a `toJSON` or a Proxy trap of the caller may. */
function fail(): never {
  throw new Error(READ_ERROR);
}

/** An object with one enumerable member whose getter throws. */
function throwingMember(name: string, target: object = {}): object {
  return Object.defineProperty(target, name, { enumerable: true, get: fail });
}

/** A Proxy that has been revoked: every read of it throws. */
function revokedProxy(): object {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  return proxy;
}

/** A search request DTO with an own function member, as a class field arrow function is. */
class SearchRequest {
  readonly term: string;
  readonly label = (): string => `search ${this.term}`;

  constructor(term: string) {
    this.term = term;
  }
}

type Paths = {
  "/search": {
    post: {
      requestBody: { content: { "application/json": { term: string } } };
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

describe("queryKeyInit functions in a body", () => {
  it("queryKeyInit leaves a function member of a body out, as JSON does", () => {
    expect(keyOf({ body: new SearchRequest(TERM) })).toEqual({ body: { term: TERM } });
  });

  it("queryKeyInit keys a function item of a body as null, as JSON sends it", () => {
    expect(keyOf({ body: [ITEM_ID, () => ITEM_ID] })).toStrictEqual({ body: [ITEM_ID, null] });
  });

  it("queryKeyInit keys a function body as no body, as JSON sends none", () => {
    expect(keyOf({ body: () => ITEM_ID })).toBeUndefined();
  });

  it("queryKeyInit leaves a function out of a toJSON form", () => {
    expect(keyOf({ body: { at: { toJSON: () => () => ITEM_ID } } })).toEqual({
      body: {},
    });
  });

  it("queryOptions with a function in a body is found with a later render's key", async () => {
    const queryClient = new QueryClient();
    await queryClient.fetchQuery(
      $api.queryOptions("post", "/search", { body: new SearchRequest(TERM) }),
    );
    const later = $api.queryOptions("post", "/search", { body: new SearchRequest(TERM) });

    expect(queryClient.getQueriesData({ queryKey: later.queryKey })).toHaveLength(1);
  });

  it("queryOptions with a function in a body is found after a JSON round trip", async () => {
    const options = $api.queryOptions("post", "/search", { body: new SearchRequest(TERM) });
    const queryClient = new QueryClient();
    await queryClient.fetchQuery(options);
    const hydrated = new QueryClient();

    hydrate(hydrated, JSON.parse(JSON.stringify(dehydrate(queryClient))));

    expect(hydrated.getQueriesData({ queryKey: options.queryKey })).toHaveLength(1);
  });
});

describe("queryKeyInit bodies it cannot read", () => {
  it("queryKeyInit leaves a reference back out of a circular body", () => {
    const node: Record<string, unknown> = { id: ITEM_ID, children: [] };
    (node.children as unknown[]).push({ id: ITEM_ID, parent: node });

    expect(keyOf({ body: node })).toEqual({
      body: { id: ITEM_ID, children: [{ id: ITEM_ID }] },
    });
  });

  it("queryKeyInit leaves a body member whose toJSON throws out", () => {
    expect(keyOf({ body: { id: ITEM_ID, at: { toJSON: fail } } })).toEqual({
      body: { id: ITEM_ID },
    });
  });

  it("queryKeyInit leaves a body member whose getter throws out", () => {
    expect(keyOf({ body: throwingMember("total", { id: ITEM_ID }) })).toEqual({
      body: { id: ITEM_ID },
    });
  });

  it("queryKeyInit keys a body whose toJSON getter throws by its members", () => {
    const body = Object.defineProperty({ id: ITEM_ID }, "toJSON", { get: fail });

    expect(keyOf({ body })).toStrictEqual({ body: { id: ITEM_ID } });
  });

  it("queryKeyInit keys a whole body whose toJSON throws by the members it sends", () => {
    expect(keyOf({ body: { id: ITEM_ID, toJSON: fail } })).toEqual({
      bodyFields: { body: { id: ITEM_ID } },
    });
  });

  it("queryKeyInit keys a revoked Proxy body as no body", () => {
    expect(keyOf({ body: revokedProxy() })).toBeUndefined();
  });

  it("queryKeyInit keys a body that refers to itself through its toJSON form", () => {
    const body: Record<string, unknown> = { id: ITEM_ID };
    body.toJSON = () => ({ body });

    expect(() => hashKey([keyOf({ body: { at: body } })])).not.toThrow();
  });
});

describe("queryKeyInit params and headers it cannot read", () => {
  it("queryKeyInit leaves header pairs with an item that is no pair out", () => {
    expect(keyOf({ headers: [["x-a", "1"], null] })).toBeUndefined();
  });

  it.each([
    ["a string", "xy"],
    ["a number", 1],
    ["a list of one item", ["x"]],
    ["a list of three items", ["x", "y", "z"]],
    ["a list-like object that is not iterable", { 0: "x", 1: "y", length: 2 }],
  ])("queryKeyInit leaves header pairs with %s for a pair out", (_name, pair) => {
    expect(keyOf({ headers: [pair] })).toBeUndefined();
  });

  it("queryKeyInit keeps header pairs given as iterable lists of two", () => {
    expect(keyOf({ headers: [new Set(["x-a", "1"])] })).toStrictEqual({ headers: { "x-a": "1" } });
  });

  it("queryKeyInit leaves a revoked Proxy query record out", () => {
    expect(keyOf({ params: { query: revokedProxy(), path: { id: ITEM_ID } } })).toStrictEqual({
      params: { path: { id: ITEM_ID } },
    });
  });

  it("queryKeyInit leaves a revoked Proxy parameter value out", () => {
    expect(keyOf({ params: { query: { a: revokedProxy(), b: ITEM_ID } } })).toStrictEqual({
      params: { query: { b: ITEM_ID } },
    });
  });

  it("queryKeyInit keeps the members of a value whose toJSON getter throws", () => {
    const value = Object.defineProperty({ id: ITEM_ID }, "toJSON", { get: fail });

    expect(keyOf({ params: { query: { a: value } } })).toStrictEqual({
      params: { query: { a: { id: ITEM_ID } } },
    });
  });

  it("queryKeyInit keeps the members of a value whose toISOString getter throws", () => {
    const value = Object.defineProperty({ id: ITEM_ID }, "toISOString", { get: fail });

    expect(keyOf({ params: { query: { a: value } } })).toStrictEqual({
      params: { query: { a: { id: ITEM_ID } } },
    });
  });

  it("queryKeyInit leaves a function out of the toJSON form of a parameter", () => {
    const value = { toJSON: () => () => ITEM_ID };

    expect(keyOf({ params: { query: { a: value } } })).toEqual({ params: { query: { a: {} } } });
  });

  it("queryKeyInit leaves a plain header whose getter throws out", () => {
    expect(keyOf({ headers: throwingMember("x-b", { "x-a": "1" }) })).toStrictEqual({
      headers: { "x-a": "1" },
    });
  });

  it("queryKeyInit leaves a params or headers getter that throws out of the init", () => {
    expect(keyOf(throwingMember("params", { headers: { "x-a": "1" } }))).toStrictEqual({
      headers: { "x-a": "1" },
    });
  });

  it("queryKeyInit keys a revoked Proxy init as no init", () => {
    expect(keyOf(revokedProxy())).toBeUndefined();
  });

  it("queryKeyInit leaves function params, records and headers out", () => {
    expect(keyOf({ params: () => ITEM_ID, headers: () => ITEM_ID })).toBeUndefined();
    expect(keyOf({ params: { query: () => ITEM_ID } })).toBeUndefined();
  });
});
