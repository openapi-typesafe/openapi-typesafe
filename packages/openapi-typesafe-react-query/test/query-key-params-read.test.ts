// @vitest-environment node
import { hashKey } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";
import { queryKeyInit } from "../src/query-key.js";

/**
 * The key reads `params` the way the fetch client reads them to send them: the records by name,
 * a path record by the names of the path template, a query record by `for..in` and a header
 * record by its own members. These tests send each input with the client and compare: inputs of
 * one key send one request, so a value behind a getter cannot share another value's entry.
 */

const NO_BASE_URL = { baseUrl: "" };
const BASE_URL = "https://api.example.com";
const TEMPLATE = "/users/{id}/{.format}/{;page*}";

class Query {
  readonly #term: string;
  constructor(term: string) {
    this.#term = term;
  }
  get query(): Record<string, string> {
    return { q: this.#term };
  }
}

class Header {
  readonly #token: string;
  constructor(token: string) {
    this.#token = token;
  }
  get header(): Record<string, string> {
    return { "x-token": this.#token };
  }
}

class PathParams {
  readonly #id: number;
  readonly #format: string;
  readonly #page: number;
  constructor(id: number, format = "json", page = 1) {
    this.#id = id;
    this.#format = format;
    this.#page = page;
  }
  get id(): number {
    return this.#id;
  }
  get format(): string {
    return this.#format;
  }
  get page(): number {
    return this.#page;
  }
}

class Params {
  readonly #path: object;
  constructor(path: object) {
    this.#path = path;
  }
  get path(): object {
    return this.#path;
  }
}

/** Params inputs by name, each a factory for a fresh value. */
const INPUTS: Readonly<Record<string, () => object>> = {
  none: () => ({}),
  plainPath: () => ({ path: { id: 1, format: "json", page: 1 } }),
  plainPathOther: () => ({ path: { id: 2, format: "json", page: 1 } }),
  getterPath: () => ({ path: new PathParams(1) }),
  getterPathOther: () => ({ path: new PathParams(2) }),
  getterPathFormat: () => ({ path: new PathParams(1, "xml") }),
  getterPathPage: () => ({ path: new PathParams(1, "json", 2) }),
  getterParams: () => new Params(new PathParams(1)),
  getterParamsOther: () => new Params(new PathParams(2)),
  getterQuery: () => new Query("cats"),
  getterQueryOther: () => new Query("dogs"),
  plainQuery: () => ({ query: { q: "cats" } }),
  inheritedQuery: () => ({ query: Object.create({ q: "cats" }) }),
  inheritedQueryOther: () => ({ query: Object.create({ q: "dogs" }) }),
  queryWithGetter: () => ({ query: new PathParams(1) }),
  inheritedQueryValue: () => ({
    query: { filter: Object.assign(Object.create({ a: 1 }), { b: 2 }) },
  }),
  inheritedQueryValueOther: () => ({
    query: { filter: Object.assign(Object.create({ a: 3 }), { b: 2 }) },
  }),
  getterHeader: () => new Header("a"),
  getterHeaderOther: () => new Header("b"),
  headerOwnOnly: () => ({ header: Object.create({ "x-token": "a" }) }),
};

/** The URL and headers the fetch client sends for these params. */
async function sent(params: object): Promise<string> {
  let request: Request | undefined;
  const client = createFetchClient<Record<string, never>>({
    baseUrl: BASE_URL,
    fetch: async (input) => {
      request = input;
      return Response.json({});
    },
  });
  await client.request("get", TEMPLATE as never, { params } as never);
  return JSON.stringify([request?.url, Array.from(request?.headers ?? [])]);
}

function keyHash(params: object): string {
  return hashKey([queryKeyInit({ params }, NO_BASE_URL, TEMPLATE)]);
}

describe("queryKeyInit params by the fetch client's reads", () => {
  it("queryKeyInit params of one key send one request for every pair of inputs", async () => {
    const makers = Object.entries(INPUTS);
    for (const [nameA, makeA] of makers) {
      for (const [nameB, makeB] of makers) {
        if (keyHash(makeA()) === keyHash(makeB())) {
          expect(await sent(makeB()), `${nameA} and ${nameB}`).toBe(await sent(makeA()));
        }
      }
    }
  });

  it.each([
    ["getterPath", "getterPathOther"],
    ["getterPath", "getterPathFormat"],
    ["getterPath", "getterPathPage"],
    ["getterParams", "getterParamsOther"],
    ["getterQuery", "getterQueryOther"],
    ["inheritedQuery", "inheritedQueryOther"],
    ["inheritedQueryValue", "inheritedQueryValueOther"],
    ["getterHeader", "getterHeaderOther"],
  ])("queryKeyInit %s and %s, which send other requests, have other keys", (nameA, nameB) => {
    const makeA = INPUTS[nameA] as () => object;
    const makeB = INPUTS[nameB] as () => object;

    expect(keyHash(makeA())).not.toBe(keyHash(makeB()));
  });

  it("queryKeyInit with a getter path record has the key of the plain record it sends", () => {
    const plain = { id: 1, format: "json", page: 1 };

    expect(keyHash({ path: new PathParams(1) })).toBe(keyHash({ path: plain }));
  });

  it("queryKeyInit without a path template reads a getter path record by its members", () => {
    expect(queryKeyInit({ params: { path: new PathParams(1) } }, NO_BASE_URL)).toBeUndefined();
  });

  it("queryKeyInit with a path getter that throws leaves that name out", () => {
    const path = Object.defineProperty({ format: "json" }, "id", {
      get: () => {
        throw new Error("cannot read");
      },
    });

    expect(queryKeyInit({ params: { path } }, NO_BASE_URL, TEMPLATE)).toStrictEqual({
      params: { path: { format: "json" } },
    });
  });

  it("queryOptions keys a getter path record by the names of its path template", () => {
    const $api = createClient(createFetchClient<Record<string, never>>({ baseUrl: BASE_URL }));
    const keyOfId = (id: number) => {
      const init = { params: { path: new PathParams(id) } } as never;
      return $api.queryOptions("get" as never, TEMPLATE as never, init).queryKey;
    };

    expect(hashKey(keyOfId(1))).not.toBe(hashKey(keyOfId(2)));
  });
});
