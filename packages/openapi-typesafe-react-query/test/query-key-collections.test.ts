// @vitest-environment node
// Node's own Request: jsdom's does not reach Node's fetch types.
import { dehydrate, hashKey, hydrate, QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";
import { queryKeyInit } from "../src/query-key.js";

/**
 * A Map or a Set holds its contents in none of its members, so JSON and the default serializers
 * send `{}` or nothing for every one, while a serializer of the client that sends the contents
 * sends different requests. The key holds the contents in order, as plain values.
 */

const NO_BASE_URL = { baseUrl: "" };
const BASE_URL = "https://api.example.com";
const TAG = "cat";
const OTHER_TAG = "dog";
const COUNT = 2;

/** The key init of a request with this init. */
function keyOf(init: object): object | undefined {
  return queryKeyInit(init, NO_BASE_URL);
}

/** The hash of the key init of a request with this init. */
function hashOf(init: object): string {
  return hashKey([keyOf(init)]);
}

type Paths = {
  "/pets": {
    get: {
      parameters: { query?: { tags?: Set<string> } };
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

describe("queryKeyInit Map and Set values", () => {
  it("queryKeyInit keys a Set parameter by its values", () => {
    expect(keyOf({ params: { query: { tags: new Set([TAG]) } } })).toStrictEqual({
      params: { query: { tags: { "values()": [TAG] } } },
    });
  });

  it("queryKeyInit keys a Map parameter by its entries", () => {
    expect(keyOf({ params: { query: { counts: new Map([[TAG, COUNT]]) } } })).toStrictEqual({
      params: { query: { counts: { "entries()": [[TAG, COUNT]] } } },
    });
  });

  it("queryKeyInit keys a Set in a body by its values", () => {
    expect(keyOf({ body: { tags: new Set([TAG, OTHER_TAG]) } })).toStrictEqual({
      body: { tags: { "values()": [TAG, OTHER_TAG] } },
    });
  });

  it("queryKeyInit keys a Map body by its entries, values keyed as body members", () => {
    expect(keyOf({ body: new Map([[TAG, Number.NaN]]) })).toStrictEqual({
      body: { "entries()": [[TAG, null]] },
      bodyType: { "entries()": { 0: { 1: "NaN" } } },
    });
  });

  it("queryKeyInit keys two Sets of different values apart", () => {
    const tags = (tag: string) => ({ body: { tags: new Set([tag]) } });

    expect(hashOf(tags(TAG))).not.toBe(hashOf(tags(OTHER_TAG)));
  });

  it("queryKeyInit keys Sets of the same values in another order apart", () => {
    const order = new Set([TAG, OTHER_TAG]);
    const reverse = new Set([OTHER_TAG, TAG]);

    expect(hashOf({ params: { query: { t: order } } })).not.toBe(
      hashOf({ params: { query: { t: reverse } } }),
    );
  });

  it("queryKeyInit keys a Set apart from an array of its values", () => {
    expect(hashOf({ body: { tags: new Set([TAG]) } })).not.toBe(hashOf({ body: { tags: [TAG] } }));
  });

  it("queryKeyInit leaves a Set that holds itself out of its values", () => {
    const tags = new Set<unknown>([TAG]);
    tags.add(tags);

    expect(keyOf({ body: { tags } })).toStrictEqual({
      body: { tags: { "values()": [TAG, null] } },
    });
  });

  it("queryKeyInit keys a WeakMap as an empty object, as nothing can read it", () => {
    expect(keyOf({ body: { a: new WeakMap() } })).toStrictEqual({ body: { a: {} } });
  });

  it("queryOptions with a Set parameter is found after a JSON round trip", async () => {
    const options = $api.queryOptions("get", "/pets", {
      params: { query: { tags: new Set([TAG]) } },
    });
    const queryClient = new QueryClient();
    await queryClient.fetchQuery(options);
    const hydrated = new QueryClient();

    hydrate(hydrated, JSON.parse(JSON.stringify(dehydrate(queryClient))));

    expect(hydrated.getQueriesData({ queryKey: options.queryKey })).toHaveLength(1);
  });
});
