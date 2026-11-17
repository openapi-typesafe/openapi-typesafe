import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, { type HeadersOptions, mergeHeaders } from "../../src/index.js";

/**
 * Headers given as pairs (an array, a `Set`, an iterator such as `map.entries()`, a generator)
 * follow the rule of every other form: `null` removes a header, `undefined` sends nothing and an
 * array appends its items. A name the pairs repeat is joined with `, `, as `Headers` joins it.
 * An iterator is read once, at the call, or when the client is made for the client's headers.
 */

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": { ok: boolean } } } } };
    post: {
      requestBody: { content: { "application/json": { name: string } } };
      responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
  };
};

const BASE_URL = "https://api.example.com";
const NAME = "x-trace";
const CLIENT_VALUE = "client";
const BODY = { name: "a" };

function recordingClient(requests: Request[], headers?: HeadersOptions) {
  return createClient<Paths>({
    baseUrl: BASE_URL,
    headers,
    fetch: async (request) => {
      requests.push(request);
      return Response.json({ ok: true });
    },
  });
}

/** The value of `NAME` that a POST with these request headers sends. */
async function sentValue(headers: HeadersOptions): Promise<string | null | undefined> {
  const requests: Request[] = [];
  await recordingClient(requests, { [NAME]: CLIENT_VALUE }).POST("/items", {
    body: BODY,
    headers,
  });
  return requests[0]?.headers.get(NAME);
}

describe("mergeHeaders pairs by the rule of every form", () => {
  it("mergeHeaders with map entries of null removes the header, as a Map does", async () => {
    expect(await sentValue(new Map([[NAME, null]]).entries())).toBeNull();
    expect(await sentValue(new Map([[NAME, null]]))).toBeNull();
  });

  it("mergeHeaders with an array of pairs of null removes the header", async () => {
    expect(await sentValue([[NAME, null]])).toBeNull();
  });

  it("mergeHeaders with map entries of an array appends each item, as a Map does", async () => {
    expect(await sentValue(new Map([[NAME, ["1", "2"]]]).entries())).toBe(`${CLIENT_VALUE}, 1, 2`);
    expect(await sentValue(new Map([[NAME, ["1", "2"]]]))).toBe(`${CLIENT_VALUE}, 1, 2`);
  });

  it("mergeHeaders with pairs of undefined keeps the client's header", async () => {
    expect(await sentValue([[NAME, undefined]])).toBe(CLIENT_VALUE);
  });

  it("mergeHeaders with pairs that repeat a name in any case joins their values", async () => {
    expect(
      await sentValue([
        [NAME, "1"],
        ["X-Trace", "2"],
      ]),
    ).toBe("1, 2");
  });

  it("mergeHeaders with pairs that remove then set a name sends the later value", async () => {
    expect(
      await sentValue([
        [NAME, null],
        [NAME, "2"],
      ]),
    ).toBe("2");
  });

  it("mergeHeaders with a record that repeats a name in another case keeps the last", () => {
    expect(mergeHeaders({ "X-Trace": "1", [NAME]: "2" }).get(NAME)).toBe("2");
  });

  it("mergeHeaders with a pair that is no list of two throws a TypeError", () => {
    expect(() => mergeHeaders([[NAME]] as never)).toThrow(TypeError);
    expect(() => mergeHeaders(["ab"] as never)).toThrow(TypeError);
    expect(() => mergeHeaders([{ 0: NAME, 1: "1", length: 2 }] as never)).toThrow(TypeError);
  });
});

describe("headers with an iterator as a pair", () => {
  it("POST with an iterator as a request header pair sends it", async () => {
    expect(await sentValue([[NAME, "1"].values()] as never)).toBe("1");
  });

  it("client headers with an iterator as a pair are sent with every request", async () => {
    const requests: Request[] = [];
    const client = recordingClient(requests, [[NAME, "1"].values()] as never);

    await client.GET("/items");
    await client.POST("/items", { body: BODY });

    expect(requests.map((request) => request.headers.get(NAME))).toEqual(["1", "1"]);
  });

  it("client headers as an array of pairs changed later are read at each request", async () => {
    const requests: Request[] = [];
    const headers: [string, string][] = [[NAME, "1"]];
    const client = recordingClient(requests, headers);

    headers.push(["x-other", "2"]);
    await client.GET("/items");

    expect(requests[0]?.headers.get("x-other")).toBe("2");
  });
});

describe("HeadersOptions types", () => {
  it("HeadersOptions takes map entries, a generator and a Map of header values", () => {
    function* pairs(): Generator<[string, string | null]> {
      yield [NAME, null];
    }

    expectTypeOf(new Map([[NAME, "1"]]).entries()).toExtend<HeadersOptions>();
    expectTypeOf(pairs()).toExtend<HeadersOptions>();
    expectTypeOf(new Map<string, string[]>()).toExtend<HeadersOptions>();
  });

  it("HeadersOptions rejects pairs of another value type", () => {
    expectTypeOf(new Map([[NAME, {}]]).entries()).not.toExtend<HeadersOptions>();
  });
});
