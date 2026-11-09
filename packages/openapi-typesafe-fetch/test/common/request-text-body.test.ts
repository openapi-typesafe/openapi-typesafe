import { describe, expect, it } from "vitest";
import createClient, { defaultBodySerializer } from "../../src/index.js";

/** String request bodies for non-JSON media types (task 7.6, ADR-013). */

type Paths = {
  "/books/{category}": {
    post: {
      parameters: { path: { category: string } };
      requestBody: { content: { "text/plain": string } };
      responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
  };
};

const BASE_URL = "https://api.example.com";

function recordingClient(requests: Request[]) {
  return createClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async (request) => {
      requests.push(request);
      return Response.json({ ok: true });
    },
  });
}

describe("string request bodies (upstream #2555, #2382)", () => {
  it("a string body with a text/plain content type is sent as is", async () => {
    const requests: Request[] = [];

    await recordingClient(requests).POST("/books/{category}", {
      params: { path: { category: "a" } },
      body: "plain text",
      headers: { "Content-Type": "text/plain" },
    });

    expect(await requests[0]?.text()).toBe("plain text");
  });

  it("defaultBodySerializer keeps JSON encoding for a string with a JSON content type", () => {
    const headers = new Headers({ "Content-Type": "application/problem+json" });

    expect(defaultBodySerializer("abc", headers)).toBe('"abc"');
  });

  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "Application/JSON ; charset=utf-8",
    "application/vnd.api+json",
    "application/merge-patch+json;profile=x",
  ])("defaultBodySerializer JSON-encodes a string for the JSON media type %j", (contentType) => {
    expect(defaultBodySerializer("abc", { "Content-Type": contentType })).toBe('"abc"');
  });

  /** Line-based JSON formats carry their records as text; quoting the body broke every line. */
  it.each([
    "application/x-ndjson",
    "application/jsonl",
    "application/json-seq",
    "application/jsonlines; charset=utf-8",
  ])("defaultBodySerializer sends a string as is for %j (RFC 6838)", (contentType) => {
    const lines = '{"a":1}\n{"a":2}\n';

    expect(defaultBodySerializer(lines, { "Content-Type": contentType })).toBe(lines);
  });

  it("defaultBodySerializer keeps JSON encoding for a string without a content type", () => {
    expect(defaultBodySerializer("abc", {})).toBe('"abc"');
  });

  it("defaultBodySerializer keeps JSON encoding for an object with a text content type", () => {
    expect(defaultBodySerializer({ a: 1 }, { "Content-Type": "text/plain" })).toBe('{"a":1}');
  });
});
