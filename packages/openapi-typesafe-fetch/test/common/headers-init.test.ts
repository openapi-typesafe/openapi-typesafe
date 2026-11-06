import { describe, expect, it } from "vitest";
import createClient, { defaultBodySerializer, mergeHeaders } from "../../src/index.js";

/**
 * Every `HeadersInit` form: a `Headers` object, a record, and a list of name and value pairs. A
 * list of pairs was read as a record of its indexes, so `[["x-t", "1"]]` became a header `0: x-t,1`.
 */

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": { ok: boolean } } } } };
    post: {
      requestBody: { content: { "application/x-www-form-urlencoded": { a: string } } };
      responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
  };
};

const BASE_URL = "https://api.example.com";
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";

function headerEntries(headers: Headers): [string, string][] {
  return [...headers.entries()];
}

function recordingClient(requests: Request[], headers?: HeadersInit) {
  return createClient<Paths>({
    baseUrl: BASE_URL,
    headers,
    fetch: async (request) => {
      requests.push(request);
      return Response.json({ ok: true });
    },
  });
}

describe("mergeHeaders with every HeadersInit form", () => {
  it("mergeHeaders reads a list of pairs as headers", () => {
    expect(headerEntries(mergeHeaders([["x-t", "1"]]))).toEqual([["x-t", "1"]]);
  });

  it("mergeHeaders joins a name that a list of pairs repeats, as Headers does", () => {
    const headers = mergeHeaders([
      ["x-t", "1"],
      ["x-t", "2"],
    ]);

    expect(headers.get("x-t")).toBe("1, 2");
  });

  it("mergeHeaders lets a later list of pairs replace an earlier record", () => {
    const headers = mergeHeaders({ "x-t": "1", "x-a": "a" }, [["X-T", "2"]]);

    expect(headerEntries(headers)).toEqual([
      ["x-a", "a"],
      ["x-t", "2"],
    ]);
  });

  it("mergeHeaders reads any iterable of pairs", () => {
    const headers = mergeHeaders(new Map([["x-t", "1"]]) as unknown as HeadersInit);

    expect(headerEntries(headers)).toEqual([["x-t", "1"]]);
  });
});

describe("the client with headers as a list of pairs", () => {
  it("a request sends client and request headers given as lists of pairs", async () => {
    const requests: Request[] = [];
    const client = recordingClient(requests, [["x-client", "c"]]);

    await client.GET("/items", { headers: [["x-request", "r"]] });

    expect(headerEntries(requests[0]?.headers ?? new Headers())).toEqual([
      ["x-client", "c"],
      ["x-request", "r"],
    ]);
  });

  it("a form Content-Type given in a list of pairs encodes the body as a form", async () => {
    const requests: Request[] = [];

    await recordingClient(requests).POST("/items", {
      body: { a: "1" },
      headers: [["Content-Type", FORM_CONTENT_TYPE]],
    });

    expect(await requests[0]?.text()).toBe("a=1");
  });
});

describe("defaultBodySerializer with every HeadersInit form", () => {
  it("defaultBodySerializer reads the content type from a list of pairs", () => {
    expect(defaultBodySerializer({ a: "1" }, [["Content-Type", FORM_CONTENT_TYPE]])).toBe("a=1");
  });

  it("defaultBodySerializer reads the content type of a record in any letter case", () => {
    expect(defaultBodySerializer({ a: "1" }, { "CONTENT-TYPE": FORM_CONTENT_TYPE })).toBe("a=1");
  });

  it("defaultBodySerializer reads the content type of a Headers object", () => {
    const headers = new Headers({ "Content-Type": FORM_CONTENT_TYPE });

    expect(defaultBodySerializer({ a: "1" }, headers)).toBe("a=1");
  });
});
