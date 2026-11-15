// @vitest-environment node
// Node's own Request: jsdom's does not reach Node's fetch types.
import { hashKey, QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";
import { queryKeyInit } from "../src/query-key.js";

/**
 * Objects in parameters and headers by every form the fetch client may send. The default
 * serializers send an object's own members, a `querySerializer` or `pathSerializer` of the client
 * may send its `toJSON` form or its text, and plain headers send its text. Two requests that may
 * be sent differently must never share a key.
 */

const NO_BASE_URL = { baseUrl: "" };
const FIRST_URL = "https://a.example/";
const SECOND_URL = "https://b.example/";
const PAGE_SIZE = 5n;

/** A value object that keeps its state in a private field and sends it as its text. */
class Slug {
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  toString(): string {
    return this.#text;
  }
}

/** A value object with a public member and a `toJSON` form that holds more than it. */
class Stamped {
  readonly id = 1;

  toJSON(): object {
    return { at: new Date(0), list: [Number.NaN] };
  }
}

/** A value object whose `toJSON` returns the object itself. */
class SelfJson {
  toJSON(): this {
    return this;
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

/** The hash of a request with one query parameter `q`. */
function queryHash(value: unknown): string {
  return initHash({ params: { query: { q: value } } });
}

/** The hash of a request with one plain header `x-q`. */
function headerHash(value: unknown): string {
  return initHash({ headers: { "x-q": value } });
}

describe("queryKeyInit objects in parameters", () => {
  it("queryKeyInit with URLs in query params gives other keys", () => {
    expect(queryHash(new URL(FIRST_URL))).not.toBe(queryHash(new URL(SECOND_URL)));
  });

  it("queryKeyInit with a URL path param keys its JSON form and its text", () => {
    expect(keyOf({ params: { path: { at: new URL(FIRST_URL) } } })).toEqual({
      params: { path: { at: { "toJSON()": FIRST_URL, "toString()": FIRST_URL } } },
    });
  });

  it("queryKeyInit with value objects of private state keys them by their text", () => {
    expect(keyOf({ params: { query: { q: new Slug("a") } } })).toEqual({
      params: { query: { q: { "toString()": "a" } } },
    });
    expect(queryHash(new Slug("a"))).not.toBe(queryHash(new Slug("b")));
  });

  it("queryKeyInit with an object of a toJSON keys its JSON form beside its members", () => {
    expect(keyOf({ params: { query: { q: new Stamped() } } })).toEqual({
      params: {
        query: {
          q: {
            id: 1,
            "toJSON()": { at: "1970-01-01T00:00:00.000Z", list: [{ "(number)": "NaN" }] },
          },
        },
      },
    });
  });

  it("queryKeyInit with a toJSON that returns its object keys its members once", () => {
    expect(keyOf({ params: { query: { q: new SelfJson() } } })).toEqual({
      params: { query: { q: { "toJSON()": {} } } },
    });
  });

  it("queryKeyInit with an object without a toString keys its members without throwing", () => {
    const value = Object.assign(Object.create(null) as object, { a: 1 });

    expect(keyOf({ params: { query: { q: value } } })).toStrictEqual({
      params: { query: { q: { a: 1 } } },
    });
  });

  it("queryKeyInit with an array toJSON form keys its items as they are sent", () => {
    expect(keyOf({ params: { query: { q: { toJSON: () => [new Date(0)] } } } })).toMatchObject({
      params: { query: { q: { "toJSON()": ["1970-01-01T00:00:00.000Z"] } } },
    });
  });

  it("queryKeyInit with a bigint query param keys its text apart from a string", () => {
    expect(keyOf({ params: { query: { limit: PAGE_SIZE } } })).toEqual({
      params: { query: { limit: { "(number)": "5" } } },
    });
  });
});

describe("queryKeyInit values of plain headers", () => {
  it("queryKeyInit with Number objects in headers keys them by the text that is sent", () => {
    expect(keyOf({ headers: { "x-q": new Number(5) } })).toEqual({ headers: { "x-q": "5" } });
    expect(headerHash(new Number(5))).not.toBe(headerHash(new Number(6)));
  });

  it("queryKeyInit with a Date header keys it by its local text, as Headers sends it", () => {
    const at = new Date(0);

    expect(keyOf({ headers: { "x-q": at } })).toEqual({ headers: { "x-q": String(at) } });
  });

  it("queryKeyInit with a number and its text in headers gives one key", () => {
    expect(headerHash(5)).toBe(headerHash("5"));
    expect(headerHash(PAGE_SIZE)).toBe(headerHash("5"));
  });

  it("queryKeyInit with an array header keys the text of each item", () => {
    expect(keyOf({ headers: { "x-q": [1, new URL(FIRST_URL)] } })).toEqual({
      headers: { "x-q": ["1", FIRST_URL] },
    });
  });

  it("queryKeyInit with a null header keeps null", () => {
    expect(keyOf({ headers: { "x-q": null } })).toEqual({ headers: { "x-q": null } });
  });

  it("queryKeyInit with a header object without a toString keys its members", () => {
    const value = Object.assign(Object.create(null) as object, { a: 1 });

    expect(keyOf({ headers: { "x-q": value } })).toEqual({ headers: { "x-q": { a: 1 } } });
  });
});

describe("queryKeyInit bigints in bodies", () => {
  it("queryKeyInit with a bigint form field keys its text and kind", () => {
    expect(keyOf({ body: { n: PAGE_SIZE } })).toEqual({
      body: { n: "5" },
      bodyType: { n: "bigint" },
    });
  });

  it("queryKeyInit with a bigint and its text in a body gives other keys", () => {
    expect(initHash({ body: PAGE_SIZE })).not.toBe(initHash({ body: "5" }));
  });
});

type Paths = {
  "/links": {
    get: {
      parameters: { query?: { at?: string } };
      responses: { 200: { content: { "application/json": string } } };
    };
  };
};

describe("query key filters with a client query serializer", () => {
  it("setQueriesData with a URL query param leaves the query of another URL", async () => {
    const $api = createClient(
      createFetchClient<Paths>({
        baseUrl: "https://api.example.com",
        querySerializer: (query) => `at=${encodeURIComponent(String(query.at))}`,
        fetch: async (request) => Response.json(new URL(request.url).searchParams.get("at")),
      }),
    );
    const queryClient = new QueryClient();
    const optionsOf = (url: string) =>
      $api.queryOptions("get", "/links", { params: { query: { at: new URL(url) as never } } });
    await queryClient.fetchQuery(optionsOf(FIRST_URL));
    await queryClient.fetchQuery(optionsOf(SECOND_URL));

    queryClient.setQueriesData({ queryKey: optionsOf(FIRST_URL).queryKey }, () => "written");

    expect(queryClient.getQueryData(optionsOf(SECOND_URL).queryKey)).toBe(SECOND_URL);
  });
});
