import { describe, expect, it } from "vitest";
import createClient from "../../src/index.js";

/**
 * Headers given as a one-shot iterable (an iterator such as `map.entries()`, or a generator) can
 * be read once only. The client reads the headers of a request with a body twice (for the body
 * serializer and for the request), and the headers of a client at each request, so each must
 * still be sent then.
 */

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": { ok: boolean } } } } };
    post: {
      requestBody: { content: { "application/json": { name: string } } };
      responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
  };
  "/forms": {
    post: {
      requestBody: { content: { "application/x-www-form-urlencoded": { name: string } } };
      responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
  };
};

const BASE_URL = "https://api.example.com";
const AUTHORIZATION = "authorization";
const TOKEN = "Bearer t";
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";

function* formHeaders(): Generator<[string, string]> {
  yield ["Content-Type", FORM_CONTENT_TYPE];
}

function* tokenHeaders(): Generator<[string, string]> {
  yield [AUTHORIZATION, TOKEN];
}

function oneShot(headers: Iterable<[string, string]>): HeadersInit {
  return headers as unknown as HeadersInit;
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

describe("headers given as a one-shot iterable", () => {
  it("POST with a body and map entries as headers sends them", async () => {
    const requests: Request[] = [];
    const client = recordingClient(requests);
    const headers = oneShot(new Map([[AUTHORIZATION, TOKEN]]).entries());

    await client.POST("/items", { body: { name: "a" }, headers });

    expect(requests[0]?.headers.get(AUTHORIZATION)).toBe(TOKEN);
  });

  it("POST with a body and generator headers keeps the JSON Content-Type", async () => {
    const requests: Request[] = [];
    const client = recordingClient(requests);

    await client.POST("/items", { body: { name: "a" }, headers: oneShot(tokenHeaders()) });

    expect(requests[0]?.headers.get(AUTHORIZATION)).toBe(TOKEN);
    expect(requests[0]?.headers.get("content-type")).toBe("application/json");
  });

  it("POST with a form Content-Type in generator headers sends a form body", async () => {
    const requests: Request[] = [];
    const client = recordingClient(requests);

    await client.POST("/forms", { body: { name: "a" }, headers: oneShot(formHeaders()) });

    expect(await requests[0]?.text()).toBe("name=a");
  });

  it("GET without a body and generator headers sends them", async () => {
    const requests: Request[] = [];
    const client = recordingClient(requests);

    await client.GET("/items", { headers: oneShot(tokenHeaders()) });

    expect(requests[0]?.headers.get(AUTHORIZATION)).toBe(TOKEN);
  });

  it("client generator headers are sent with every request", async () => {
    const requests: Request[] = [];
    const client = recordingClient(requests, oneShot(tokenHeaders()));

    await client.GET("/items");
    await client.POST("/items", { body: { name: "a" } });

    expect(requests.map((request) => request.headers.get(AUTHORIZATION))).toEqual([TOKEN, TOKEN]);
  });

  it("a headers object changed after createClient is read at each request", async () => {
    const requests: Request[] = [];
    const headers: Record<string, string> = { [AUTHORIZATION]: "Bearer old" };
    const client = recordingClient(requests, headers);

    headers[AUTHORIZATION] = TOKEN;
    await client.GET("/items");

    expect(requests[0]?.headers.get(AUTHORIZATION)).toBe(TOKEN);
  });
});
