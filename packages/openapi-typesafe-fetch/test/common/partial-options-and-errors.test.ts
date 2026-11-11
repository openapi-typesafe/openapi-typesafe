import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import createClient, {
  createQuerySerializer,
  type QuerySerializerOptions,
} from "../../src/index.js";

/**
 * `QuerySerializerOptions` asked for both `style` and `explode`, though each has a default, and
 * `onError` took only an `Error` of this realm: one from `node:vm` or an iframe failed
 * `instanceof Error` and was rejected as not an error.
 */

describe("query serializer options with one of style and explode", () => {
  it("an array style alone takes the explode of that style", () => {
    const serialize = createQuerySerializer({ array: { style: "pipeDelimited" } });

    expect(serialize({ ids: [1, 2] })).toBe("ids=1|2");
  });

  it("an array explode alone keeps the form style", () => {
    const serialize = createQuerySerializer({ array: { explode: false } });

    expect(serialize({ ids: [1, 2] })).toBe("ids=1,2");
  });

  it("an object explode alone keeps the deepObject style", () => {
    const serialize = createQuerySerializer({ object: { explode: true } });

    expect(serialize({ filter: { role: "admin" } })).toBe("filter[role]=admin");
  });

  it("an object style alone keeps explode true", () => {
    const serialize = createQuerySerializer({ object: { style: "form" } });

    expect(serialize({ filter: { role: "admin" } })).toBe("role=admin");
  });

  it("an undefined style takes the default", () => {
    const serialize = createQuerySerializer({ object: { style: undefined, explode: undefined } });

    expect(serialize({ filter: { role: "admin" } })).toBe("filter[role]=admin");
  });
});

type QueryPaths = {
  "/items": {
    get: {
      parameters: { query?: Record<string, unknown> };
      responses: { 200: { content: { "application/json": string } } };
    };
  };
};

/** A client with the given query options; `send` returns the query string it sent. */
function queryClient(querySerializer: QuerySerializerOptions) {
  const searches: string[] = [];
  const client = createClient<QueryPaths>({
    baseUrl: "https://api.example.com",
    querySerializer,
    fetch: async (request) => {
      searches.push(new URL(request.url).search);
      return Response.json("ok");
    },
  });
  const send = async (query: Record<string, unknown>, options: QuerySerializerOptions) => {
    await client.GET("/items", { params: { query }, querySerializer: options });
    return searches.at(-1);
  };
  return send;
}

describe("request query options set to undefined", () => {
  it("an undefined array style and explode take the client's", async () => {
    const send = queryClient({ array: { style: "pipeDelimited", explode: true } });

    const search = await send({ ids: [1, 2] }, { array: { style: undefined, explode: undefined } });

    expect(search).toBe("?ids=1&ids=2");
  });

  it("an undefined array explode keeps the client's explode", async () => {
    const send = queryClient({ array: { style: "pipeDelimited", explode: true } });

    const search = await send({ ids: [1, 2] }, { array: { explode: undefined } });

    expect(search).toBe("?ids=1&ids=2");
  });

  it("an undefined object style and explode take the client's", async () => {
    const send = queryClient({ object: { style: "form", explode: false } });

    const search = await send(
      { f: { a: 1 } },
      { object: { style: undefined, explode: undefined } },
    );

    expect(search).toBe("?f=a,1");
  });

  it("an undefined allowReserved takes the client's", async () => {
    const send = queryClient({ allowReserved: true });

    const search = await send({ path: "a/b" }, { allowReserved: undefined });

    expect(search).toBe("?path=a/b");
  });

  it("a defined request option still wins over the client's", async () => {
    const send = queryClient({ array: { style: "pipeDelimited", explode: true } });

    const search = await send({ ids: [1, 2] }, { array: { style: undefined, explode: false } });

    expect(search).toBe("?ids=1|2");
  });
});

describe("onError returning an Error of another realm", () => {
  it("the request rejects with that error", async () => {
    const foreignError = runInNewContext('new Error("replaced")') as Error;
    const client = createClient<Record<string, never>>({
      baseUrl: "https://api.example.com",
      fetch: async () => {
        throw new TypeError("network down");
      },
    });
    client.use({ onError: () => foreignError });

    const request = client.request("get", "/items" as never);

    await expect(request).rejects.toBe(foreignError);
  });
});
