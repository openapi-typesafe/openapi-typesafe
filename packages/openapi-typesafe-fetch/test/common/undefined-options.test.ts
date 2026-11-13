import { describe, expect, it } from "vitest";
import createClient from "../../src/index.js";

/**
 * An option set to `undefined` counts as left out, at the client and on a request, so a wrapper
 * can pass its own optional options on. The option types say `| undefined` for that.
 */

type Paths = {
  "/items": {
    post: {
      parameters: { query?: { tag?: string } };
      requestBody?: { content: { "application/json": { name: string } } };
      responses: { 200: { headers: {}; content: { "application/json": string[] } } };
    };
  };
};

const BASE_URL = "https://api.example.com";
const ITEMS = ["a", "b"];

function recordingFetch(requests: Request[]) {
  return async (request: Request) => {
    requests.push(request);
    return Response.json(ITEMS);
  };
}

const UNDEFINED_CLIENT_OPTIONS = {
  Request: undefined,
  FormData: undefined,
  querySerializer: undefined,
  bodySerializer: undefined,
  pathSerializer: undefined,
  headers: undefined,
  requestInitExt: undefined,
};

const UNDEFINED_REQUEST_OPTIONS = {
  params: undefined,
  body: undefined,
  querySerializer: undefined,
  bodySerializer: undefined,
  pathSerializer: undefined,
  headers: undefined,
  parseAs: undefined,
  middleware: undefined,
};

describe("options set to undefined", () => {
  it("POST with every client and request option undefined sends the default request", async () => {
    const requests: Request[] = [];
    const client = createClient<Paths>({
      ...UNDEFINED_CLIENT_OPTIONS,
      baseUrl: BASE_URL,
      fetch: recordingFetch(requests),
    });

    const { data } = await client.POST("/items", {
      ...UNDEFINED_REQUEST_OPTIONS,
      baseUrl: undefined,
      fetch: undefined,
    });

    expect(data).toEqual(ITEMS);
    expect(requests.map((request) => request.url)).toEqual([`${BASE_URL}/items`]);
    expect(requests[0]?.body).toBeNull();
  });

  it("POST with an undefined client baseUrl and fetch takes the request's", async () => {
    const requests: Request[] = [];
    const client = createClient<Paths>({ baseUrl: undefined, fetch: undefined });

    await client.POST("/items", {
      ...UNDEFINED_REQUEST_OPTIONS,
      baseUrl: BASE_URL,
      fetch: recordingFetch(requests),
    });

    expect(requests.map((request) => request.url)).toEqual([`${BASE_URL}/items`]);
  });

  it("POST with undefined request serializers keeps the client's", async () => {
    const requests: Request[] = [];
    const client = createClient<Paths>({
      baseUrl: BASE_URL,
      fetch: recordingFetch(requests),
      querySerializer: () => "from=client",
      bodySerializer: () => "client body",
      headers: { "x-client": "1" },
    });

    await client.POST("/items", {
      ...UNDEFINED_REQUEST_OPTIONS,
      params: { query: { tag: "t" } },
      body: { name: "n" },
    });

    expect(requests[0]?.url).toBe(`${BASE_URL}/items?from=client`);
    expect(requests[0]?.headers.get("x-client")).toBe("1");
    expect(await requests[0]?.text()).toBe("client body");
  });
});
