import { MockAgent, Request as UndiciRequest, fetch as undiciFetch } from "undici";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import createClient, { type CustomFetchClientOptions, createPathBasedClient } from "../../src/index.js";

/**
 * `fetch` and `Request` of the `undici` package work at runtime, but their types are not the DOM
 * lib's (`duplex`, `RequestDestination`, `BodyInit` and the `Response` differ), so passing them to
 * `createClient` failed to compile (upstream #2562). The undici `fetch` needs the undici `Request`:
 * it reads any other request as the URL "[object Request]".
 */

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": { id: number }[] } } } };
  };
};

const ORIGIN = "https://api.example.com";
const OK = 200;

/** An undici dispatcher that answers `GET /items` without a network. */
function createItemsAgent(): MockAgent {
  const agent = new MockAgent();
  agent.disableNetConnect();
  agent
    .get(ORIGIN)
    .intercept({ path: "/items", method: "GET" })
    .reply(OK, [{ id: 1 }]);
  return agent;
}

const agents: MockAgent[] = [];

afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.close()));
});

function undiciOptions() {
  const agent = createItemsAgent();
  agents.push(agent);
  return {
    baseUrl: ORIGIN,
    fetch: undiciFetch,
    Request: UndiciRequest,
    requestInitExt: { dispatcher: agent },
  };
}

describe("createClient with the undici package", () => {
  it("createClient with undici fetch and Request sends the request", async () => {
    const client = createClient<Paths>(undiciOptions());

    const { data } = await client.GET("/items");

    expectTypeOf(data).toEqualTypeOf<{ id: number }[] | undefined>();
    expect(data).toEqual([{ id: 1 }]);
  });

  it("createPathBasedClient with undici fetch and Request sends the request", async () => {
    const client = createPathBasedClient<Paths>(undiciOptions());

    const { data } = await client["/items"].GET();

    expect(data).toEqual([{ id: 1 }]);
  });

  it("createClient types an inline fetch input as the DOM Request", () => {
    createClient<Paths>({
      fetch: async (input) => {
        expectTypeOf(input).toEqualTypeOf<Request>();
        return Response.json([]);
      },
    });
  });

  it("CustomFetchClientOptions takes the undici fetch and Request", () => {
    const options: CustomFetchClientOptions = { baseUrl: ORIGIN, fetch: undiciFetch, Request: UndiciRequest };

    expectTypeOf(createClient<Paths>(options)).toEqualTypeOf(createClient<Paths>({ baseUrl: ORIGIN }));
  });
});
