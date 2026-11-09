import {
  Headers as UndiciHeaders,
  Request as UndiciRequest,
  Response as UndiciResponse,
} from "undici";
import { describe, expect, it } from "vitest";
import createClient, { type Middleware, mergeHeaders } from "../../src/index.js";

/**
 * `Request`, `Response` and `Headers` objects that are not instances of this realm's global
 * classes: from the `undici` package (a second copy next to the one Node.js ships), from another
 * realm (an iframe, an Electron host), or from a `Request` class passed as an option. `instanceof`
 * rejected them (upstream #1847), and `mergeHeaders` read such headers as an empty object.
 */

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": { source: string } } } } };
  };
};

const BASE_URL = "https://api.example.com";
const ITEMS_URL = `${BASE_URL}/items`;

/** A client whose fetch answers `{ source: "fetch" }` and records the requests it gets. */
function createRecordingClient(options: { Request?: typeof Request } = {}) {
  const requests: Request[] = [];
  const client = createClient<Paths>({
    baseUrl: BASE_URL,
    ...options,
    fetch: async (request) => {
      requests.push(request);
      return Response.json({ source: "fetch" });
    },
  });
  return { client, requests };
}

/** The undici package types differ from the DOM lib types; the runtime objects are the same kind. */
function asDom<T>(value: unknown): T {
  return value as T;
}

describe("middleware results from another fetch implementation", () => {
  it("onRequest returning an undici package Request sends that request", async () => {
    const { client, requests } = createRecordingClient();
    const replacement = asDom<Request>(
      new UndiciRequest(ITEMS_URL, { headers: { "X-Test": "1" } }),
    );
    client.use({ onRequest: () => replacement });

    await client.GET("/items");

    expect(requests).toEqual([replacement]);
  });

  it("onRequest returning an undici package Response skips fetch and returns it", async () => {
    const { client, requests } = createRecordingClient();
    const answer = asDom<Response>(UndiciResponse.json({ source: "middleware" }));
    client.use({ onRequest: () => answer });

    const { data } = await client.GET("/items");

    expect(requests).toEqual([]);
    expect(data).toEqual({ source: "middleware" });
  });

  it("onResponse returning an undici package Response returns its data", async () => {
    const { client } = createRecordingClient();
    client.use({
      onResponse: () => asDom<Response>(UndiciResponse.json({ source: "middleware" })),
    });

    const { data } = await client.GET("/items");

    expect(data).toEqual({ source: "middleware" });
  });

  it("onError returning an undici package Response recovers the request", async () => {
    const client = createClient<Paths>({
      baseUrl: BASE_URL,
      fetch: async () => {
        throw new TypeError("network down");
      },
    });
    const recovery: Middleware = {
      onError: () => asDom<Response>(UndiciResponse.json({ source: "middleware" })),
    };
    client.use(recovery);

    const { data } = await client.GET("/items");

    expect(data).toEqual({ source: "middleware" });
  });

  it("onRequest returning a global Request with a custom Request class option sends it", async () => {
    class CustomRequest extends Request {}
    const { client, requests } = createRecordingClient({ Request: CustomRequest });
    const replacement = new Request(ITEMS_URL);
    client.use({ onRequest: () => replacement });

    await client.GET("/items");

    expect(requests).toEqual([replacement]);
  });

  it("onRequest returning a plain copy of the request still throws", async () => {
    const { client } = createRecordingClient();
    client.use({ onRequest: ({ request }) => ({ ...request }) as Request });

    await expect(client.GET("/items")).rejects.toThrow(/onRequest: must return/);
  });

  it("onResponse returning an object without ok and text() throws", async () => {
    const { client } = createRecordingClient();
    const lookalike = { status: 200, headers: new Headers(), text: async () => '{"id":1}' };
    client.use({ onResponse: () => lookalike as unknown as Response });

    await expect(client.GET("/items")).rejects.toThrow(/onResponse: must return new Response/);
  });

  it("onRequest returning a status and headers without ok throws", async () => {
    const { client } = createRecordingClient();
    const lookalike = { status: 200, headers: new Headers() };
    client.use({ onRequest: () => lookalike as unknown as Response });

    await expect(client.GET("/items")).rejects.toThrow(/onRequest: must return/);
  });

  it("a fetch option returning an object without ok throws instead of reading an error", async () => {
    const lookalike = { status: 200, headers: new Headers(), text: async () => '{"id":1}' };
    const client = createClient<Paths>({
      baseUrl: BASE_URL,
      fetch: async () => lookalike as unknown as Response,
    });

    await expect(client.GET("/items")).rejects.toThrow("fetch: must return new Response()");
  });

  it("a fetch option returning an undici package Response returns its data", async () => {
    const client = createClient<Paths>({
      baseUrl: BASE_URL,
      fetch: async () => asDom<Response>(UndiciResponse.json({ source: "undici" })),
    });

    const { data } = await client.GET("/items");

    expect(data).toEqual({ source: "undici" });
  });

  it("onRequest returning a method and a url without headers still throws", async () => {
    const { client } = createRecordingClient();
    client.use({ onRequest: ({ request }) => ({ method: "GET", url: request.url }) as Request });

    await expect(client.GET("/items")).rejects.toThrow(/onRequest: must return/);
  });
});

describe("mergeHeaders with headers from another fetch implementation", () => {
  it("mergeHeaders copies the entries of undici package Headers", () => {
    const headers = asDom<Headers>(new UndiciHeaders({ Authorization: "Bearer token" }));

    expect(mergeHeaders(headers).get("Authorization")).toBe("Bearer token");
  });
});
