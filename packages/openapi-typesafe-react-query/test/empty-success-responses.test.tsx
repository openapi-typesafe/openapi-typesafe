import { QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";

/**
 * A successful response without a body gives `data: undefined` in the fetch client, which TanStack
 * Query rejects ("Query data cannot be undefined"). Only a 204 and `Content-Length: 0` became `null`;
 * an empty chunked body and every HEAD response did not (upstream #2234).
 */

type Item = { id: number };
type Operation = {
  responses: {
    200: { content: { "application/json": Item } };
    204: { content?: never };
  };
};
type Paths = { "/items": { get: Operation; head: Operation } };

const BASE_URL = "https://api.example.com";
const OK = 200;
const NO_CONTENT = 204;

function clientAnswering(response: () => Response) {
  const fetchClient = createFetchClient<Paths>({ baseUrl: BASE_URL, fetch: async () => response() });
  return createClient(fetchClient);
}

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("successful responses without a body", () => {
  it("queryFn of an empty body without Content-Length resolves to null", async () => {
    const client = clientAnswering(() => new Response(null, { status: OK }));

    const data = await createQueryClient().fetchQuery(client.queryOptions("get", "/items"));

    expect(data).toBeNull();
  });

  it("queryFn of a HEAD request resolves to null", async () => {
    const client = clientAnswering(() => Response.json({ id: 1 }, { status: OK }));

    const data = await createQueryClient().fetchQuery(client.queryOptions("head", "/items"));

    expect(data).toBeNull();
  });

  it("queryFn of a 204 resolves to null", async () => {
    const client = clientAnswering(() => new Response(null, { status: NO_CONTENT }));

    const data = await createQueryClient().fetchQuery(client.queryOptions("get", "/items"));

    expect(data).toBeNull();
  });

  it("queryFn of a body resolves to the parsed body", async () => {
    const client = clientAnswering(() => Response.json({ id: 1 }, { status: OK }));

    const data = await createQueryClient().fetchQuery(client.queryOptions("get", "/items"));

    expect(data).toEqual({ id: 1 });
  });
});
