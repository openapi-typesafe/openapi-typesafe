import { afterEach, beforeEach, describe, expect, it } from "vitest";
import createClient from "../../src/index.js";

/**
 * A runtime that lacks some platform classes, as React Native (Hermes) has `fetch` but no
 * `ReadableStream`. The client checks bodies against these classes, and a check of a missing class
 * threw `ReferenceError` on every request (ADR-013, decision 6).
 */

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": { ok: number } } } } };
    post: {
      requestBody: { content: { "application/json": { name: string } } };
      responses: { 200: { content: { "application/json": { ok: number } } } };
    };
  };
};

const MISSING_GLOBALS = ["ReadableStream", "Blob", "File", "FormData", "URLSearchParams"] as const;

/** A `Request` that keeps what the client sets, built without any of the missing classes. */
class PlainRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: unknown;
  constructor(url: string, init: RequestInit) {
    this.url = url;
    this.method = init.method ?? "GET";
    this.headers = new Headers(init.headers);
    this.body = init.body;
  }
}

/** A client whose fetch records each request and answers `{ ok: 1 }` with a plain response. */
function plainClient() {
  const requests: PlainRequest[] = [];
  const client = createClient<Paths>({
    baseUrl: "https://api.example.com",
    Request: PlainRequest as unknown as typeof Request,
    fetch: async (request) => {
      requests.push(request as unknown as PlainRequest);
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        text: async () => '{"ok":1}',
      } as Response;
    },
  });
  return { client, requests };
}

describe("a runtime without ReadableStream, Blob, File, FormData and URLSearchParams", () => {
  const saved = new Map<string, PropertyDescriptor>();

  beforeEach(() => {
    // Node.js loads its fetch classes on first use, and they need streams themselves; a runtime
    // without streams has its own Headers.
    new Headers();
    for (const name of MISSING_GLOBALS) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
      if (descriptor) {
        saved.set(name, descriptor);
      }
      Reflect.deleteProperty(globalThis, name);
    }
  });

  afterEach(() => {
    for (const [name, descriptor] of saved) {
      Object.defineProperty(globalThis, name, descriptor);
    }
    saved.clear();
  });

  it("GET without a body returns the data", async () => {
    const { client } = plainClient();

    const { data } = await client.GET("/items");

    expect(data).toEqual({ ok: 1 });
    expect("ReadableStream" in globalThis).toBe(false);
  });

  it("POST with a JSON body sends it as JSON", async () => {
    const { client, requests } = plainClient();

    const { data } = await client.POST("/items", { body: { name: "a" } });

    expect(data).toEqual({ ok: 1 });
    expect(requests[0]?.body).toBe('{"name":"a"}');
    expect(requests[0]?.headers.get("Content-Type")).toBe("application/json");
  });

  it("POST with a typed array body sends it as it is", async () => {
    const { client, requests } = plainClient();
    const bytes = new Uint8Array([1, 2, 3]);

    await client.POST("/items", { body: bytes as unknown as { name: string } });

    expect(requests[0]?.body).toBe(bytes);
    expect(requests[0]?.headers.get("Content-Type")).toBeNull();
  });
});
