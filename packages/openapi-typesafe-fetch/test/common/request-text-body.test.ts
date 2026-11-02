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

  it("defaultBodySerializer keeps JSON encoding for a string without a content type", () => {
    expect(defaultBodySerializer("abc", {})).toBe('"abc"');
  });

  it("defaultBodySerializer keeps JSON encoding for an object with a text content type", () => {
    expect(defaultBodySerializer({ a: 1 }, { "Content-Type": "text/plain" })).toBe('{"a":1}');
  });
});
