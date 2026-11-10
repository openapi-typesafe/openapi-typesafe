import { describe, expect, it } from "vitest";
import createClient from "../../src/index.js";

/**
 * Header parameter values in the `simple` style, the only style OpenAPI has for headers. A `Date`
 * went out as local time (`Thu Jan 01 1970 01:00:00 GMT+0100`), an object as `[object Object]`,
 * and an array as `a, b` from `Headers.append`. They now follow the rules of a `simple` path
 * parameter.
 */

type Paths = {
  "/items": {
    get: {
      parameters: {
        header?: {
          "X-Since"?: Date;
          "X-Tags"?: string[];
          "X-Filter"?: Record<string, unknown>;
          "X-List"?: unknown[];
          "X-Trace"?: string | null;
          "X-Limit"?: number;
        };
      };
      responses: { 200: { content: { "application/json": string } } };
    };
  };
};

function recordingClient() {
  const requests: Request[] = [];
  const client = createClient<Paths>({
    baseUrl: "https://api.example.com",
    headers: { "X-Trace": "client" },
    fetch: async (request) => {
      requests.push(request);
      return Response.json("ok");
    },
  });
  return { client, requests };
}

async function sentHeaders(header: NonNullable<Paths["/items"]["get"]["parameters"]["header"]>) {
  const { client, requests } = recordingClient();
  await client.GET("/items", { params: { header } });
  return requests[0]?.headers ?? new Headers();
}

describe("header parameter values", () => {
  it("a Date is sent as ISO 8601", async () => {
    const headers = await sentHeaders({ "X-Since": new Date(0) });

    expect(headers.get("X-Since")).toBe("1970-01-01T00:00:00.000Z");
  });

  it("an array is sent as a comma list, not percent-encoded", async () => {
    const headers = await sentHeaders({ "X-Tags": ["a b", "c/d"] });

    expect(headers.get("X-Tags")).toBe("a b,c/d");
  });

  it("an object is sent as name and value pairs", async () => {
    const headers = await sentHeaders({ "X-Filter": { role: "admin", page: 2 } });

    expect(headers.get("X-Filter")).toBe("role,admin,page,2");
  });

  it("an object's names are not percent-encoded either", async () => {
    const headers = await sentHeaders({ "X-Filter": { "a b": "c d", é: "é" } });

    expect(headers.get("X-Filter")).toBe("a b,c d,é,é");
  });

  it("a nested object value fails instead of sending [object Object]", async () => {
    await expect(sentHeaders({ "X-Filter": { filter: { role: "admin" } } })).rejects.toThrow(
      "Deeply-nested",
    );
  });

  it("a nested array item fails instead of sending [object Object]", async () => {
    await expect(sentHeaders({ "X-List": ["a", { b: 1 }] })).rejects.toThrow("Deeply-nested");
  });

  it("an empty array or object sends no header", async () => {
    const headers = await sentHeaders({ "X-Filter": {}, "X-Tags": [] });

    expect(headers.has("X-Filter")).toBe(false);
    expect(headers.has("X-Tags")).toBe(false);
  });

  it("null still removes a header and a number is sent as its text", async () => {
    const headers = await sentHeaders({ "X-Trace": null, "X-Limit": 10 });

    expect(headers.has("X-Trace")).toBe(false);
    expect(headers.get("X-Limit")).toBe("10");
  });
});
