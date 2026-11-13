import { hashKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { queryKeyInit } from "../src/query-key.js";

/**
 * Parameter, header and form values in a key as the fetch client sends them. TanStack Query's
 * hash writes `NaN` and the infinities as `null`, while a parameter or a form field sends their
 * text and `null` sends nothing; a key must differ exactly when the request differs.
 */

const NO_BASE_URL = { baseUrl: "" };
const EPOCH_TEXT = "1970-01-01T00:00:00.000Z";

/** The hash TanStack Query gives the key init of a request with this init. */
function initHash(init: object): string {
  return hashKey([queryKeyInit(init, NO_BASE_URL)]);
}

/** The hash of a request with one query parameter `n`. */
function queryHash(value: unknown): string {
  return initHash({ params: { query: { n: value } } });
}

describe("queryKeyInit numbers JSON cannot hold in parameters", () => {
  it("queryKeyInit with NaN and null query params gives other keys", () => {
    expect(queryHash(Number.NaN)).not.toBe(queryHash(null));
  });

  it("queryKeyInit with NaN and the infinities in query params gives other keys", () => {
    const keys = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map(queryHash);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("queryKeyInit with NaN and its text in a query param gives one key", () => {
    expect(queryHash(Number.NaN)).toBe(queryHash("NaN"));
    expect(queryHash(Number.NEGATIVE_INFINITY)).toBe(queryHash("-Infinity"));
  });

  it("queryKeyInit with a finite number in a query param keeps it as it is", () => {
    expect(queryKeyInit({ params: { query: { n: 1 } } }, NO_BASE_URL)).toEqual({
      params: { query: { n: 1 } },
    });
  });

  it("queryKeyInit with NaN in an array query param keys the item by its text", () => {
    expect(queryHash([Number.NaN])).toBe(queryHash(["NaN"]));
  });

  it("queryKeyInit with Infinity and null path and header params gives other keys", () => {
    const path = (id: unknown) => initHash({ params: { path: { id } } });
    const header = (since: unknown) => initHash({ params: { header: { since } } });

    expect(path(Number.POSITIVE_INFINITY)).not.toBe(path(null));
    expect(header(Number.POSITIVE_INFINITY)).not.toBe(header(null));
  });

  it("queryKeyInit with NaN and null in the init headers gives other keys", () => {
    expect(initHash({ headers: { "X-N": Number.NaN } })).not.toBe(
      initHash({ headers: { "X-N": null } }),
    );
  });
});

describe("queryKeyInit dates and objects in parameters", () => {
  it("queryKeyInit with a Date query param keys it by its ISO text", () => {
    expect(queryKeyInit({ params: { query: { from: new Date(0) } } }, NO_BASE_URL)).toEqual({
      params: { query: { from: EPOCH_TEXT } },
    });
  });

  it("queryKeyInit with an object of a toISOString keys it as the client sends it", () => {
    const day = { toISOString: () => "2026-01-01" };

    expect(queryKeyInit({ params: { query: { day } } }, NO_BASE_URL)).toEqual({
      params: { query: { day: "2026-01-01" } },
    });
  });

  it("queryKeyInit with an invalid Date query param gives a key without throwing", () => {
    const init = { params: { query: { from: new Date(Number.NaN) } } };

    expect(queryKeyInit(init, NO_BASE_URL)).toEqual({ params: { query: { from: null } } });
  });

  it("queryKeyInit with Dates in an array query param keys them by their ISO texts", () => {
    expect(queryHash([new Date(0)])).toBe(queryHash([EPOCH_TEXT]));
  });

  it("queryKeyInit with an object query param keys its members as they are sent", () => {
    expect(queryKeyInit({ params: { query: { f: { at: new Date(0) } } } }, NO_BASE_URL)).toEqual({
      params: { query: { f: { at: EPOCH_TEXT } } },
    });
  });

  it("queryKeyInit with boxed primitives in query params keys them by their members", () => {
    expect(queryKeyInit({ params: { query: { n: new Number(1) } } }, NO_BASE_URL)).toEqual({
      params: { query: { n: {} } },
    });
    expect(queryHash(new String("ab"))).toBe(queryHash({ 0: "a", 1: "b" }));
  });

  it("queryKeyInit with an empty object query param keeps it", () => {
    expect(queryKeyInit({ params: { query: { f: {} } } }, NO_BASE_URL)).toEqual({
      params: { query: { f: {} } },
    });
  });
});

describe("queryKeyInit numbers JSON cannot hold in bodies", () => {
  /** The hash of a request with this body. */
  function bodyHash(body: unknown): string {
    return initHash({ body });
  }

  it("queryKeyInit with NaN and null form fields gives other keys", () => {
    expect(bodyHash({ n: Number.NaN })).not.toBe(bodyHash({ n: null }));
    expect(bodyHash({ n: Number.NaN })).not.toBe(bodyHash({ n: Number.POSITIVE_INFINITY }));
  });

  it("queryKeyInit with NaN in a body keeps its JSON form and names its text", () => {
    expect(
      queryKeyInit({ body: { n: Number.NaN, list: [Number.NEGATIVE_INFINITY] } }, NO_BASE_URL),
    ).toEqual({
      body: { n: null, list: [null] },
      bodyType: { n: "NaN", list: { 0: "-Infinity" } },
    });
  });

  it("queryKeyInit with NaN in a body keeps it apart from its text", () => {
    expect(bodyHash({ n: Number.NaN })).not.toBe(bodyHash({ n: "NaN" }));
  });

  it("queryKeyInit with a toJSON form of NaN keys it as a NaN in a body", () => {
    expect(queryKeyInit({ body: { n: { toJSON: () => Number.NaN } } }, NO_BASE_URL)).toEqual({
      body: { n: null },
      bodyType: { n: "NaN" },
    });
  });

  it("queryKeyInit with a whole NaN body keeps it apart from a null body", () => {
    expect(bodyHash(Number.NaN)).not.toBe(bodyHash(null));
  });
});
