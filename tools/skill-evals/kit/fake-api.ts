/**
 * Test kit for the hidden checks: a fake `fetch` that records every request and answers from a
 * handler. Checks build real clients on it, so they test behavior, not how the code is written.
 */
import createClient, { type Client } from "openapi-typesafe-fetch";
import type { components, paths } from "../src/api/schema";

export const BASE_URL = "https://api.petclinic.test/v1";

export type Pet = components["schemas"]["Pet"];

export const REX: Pet = { id: 1, name: "Rex", tag: "dog", status: "available", ownerId: "o-1" };
export const TOM: Pet = { id: 2, name: "Tom", tag: "cat", status: "adopted", ownerId: null };

/** A request as the fake saw it, with the body already read. */
export interface RecordedRequest {
  readonly method: string;
  readonly url: URL;
  readonly headers: Headers;
  readonly body: string;
}

export type Respond = (request: Request) => Response | Promise<Response>;

export interface FakeFetch {
  readonly fetch: (input: Request) => Promise<Response>;
  readonly requests: RecordedRequest[];
}

export function createFakeFetch(respond: Respond): FakeFetch {
  const requests: RecordedRequest[] = [];
  const fetch = async (input: Request): Promise<Response> => {
    const body = await input.clone().text();
    requests.push({ method: input.method, url: new URL(input.url), headers: input.headers, body });
    return respond(input);
  };
  return { fetch, requests };
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function empty(status: number): Response {
  return new Response(null, { status });
}

/** The single request a check expects; fails with the list when there were more or none. */
export function onlyRequest(fake: FakeFetch): RecordedRequest {
  const [first, ...rest] = fake.requests;
  if (first === undefined || rest.length > 0) {
    throw new Error(`expected one request, got ${fake.requests.length}`);
  }
  return first;
}

/** A real client on the fake, as the task code receives it. */
export function createTestClient(fake: FakeFetch): Client<paths> {
  return createClient<paths>({ baseUrl: BASE_URL, fetch: fake.fetch });
}

/** A fetch that fails as it does offline: `TypeError: fetch failed`. */
export async function failingFetch(): Promise<Response> {
  throw new TypeError("fetch failed");
}
