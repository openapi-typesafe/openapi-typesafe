import { runInNewContext } from "node:vm";
import { hashKey } from "@tanstack/react-query";
import { mergeHeaders } from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import { queryKeyInit } from "../src/query-key.js";

/**
 * The key reads `headers` by the rule of the fetch client's `mergeHeaders`, which sends them:
 * these tests run both on the same inputs, so the two cannot drift apart. Each input is made
 * anew for each read, since an iterator is used up by one.
 */

const NO_BASE_URL = { baseUrl: "" };
const NAME = "x-default";

/** Headers of the client that an init's headers may set, remove or append to. */
const CLIENT_HEADERS: readonly Record<string, string>[] = [{}, { [NAME]: "on", "x-other": "1" }];

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
  pairsNull: () => [[NAME, null]],
  pairsInSet: () => new Set([[NAME, "a"]]),
  notObject: () => "x-default: a",
};

/** The headers a request with these init headers sends, as a sorted list of pairs. */
function sent(client: Record<string, string>, headers: unknown): [string, string][] {
  return Array.from(mergeHeaders(client, headers as Record<string, string>));
}

/** The headers part of the key of a request with these init headers. */
function headersKeyOf(headers: unknown): unknown {
  return (queryKeyInit({ headers }, NO_BASE_URL) as { headers?: unknown } | undefined)?.headers;
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
  it("queryKeyInit with map.entries() headers leaves them for the request", () => {
    const headers = new Map([[NAME, "a"]]).entries();

    expect(headersKeyOf(headers)).toBeUndefined();
    expect(sent({}, headers)).toEqual([[NAME, "a"]]);
  });

  it("queryKeyInit with generator headers leaves them for the request", () => {
    function* pairs(): Generator<[string, string]> {
      yield [NAME, "a"];
    }
    const headers = pairs();

    expect(headersKeyOf(headers)).toBeUndefined();
    expect(sent({}, headers)).toEqual([[NAME, "a"]]);
  });

  it("queryKeyInit with an iterator as a header pair leaves it for the request", () => {
    const headers = [[NAME, "a"].values()];

    expect(headersKeyOf(headers)).toBeUndefined();
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
