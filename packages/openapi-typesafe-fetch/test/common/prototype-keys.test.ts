import { afterEach, describe, expect, it } from "vitest";
import createClient from "../../src/index.js";

/**
 * Parameters parsed from JSON can hold an own `__proto__` key (pre-beta test plan 10.6). The
 * client serializes it as a name and never writes to `Object.prototype`.
 */

const fromJson = (text: string) => JSON.parse(text) as Record<string, unknown>;

async function sentURL(path: string, params: Record<string, unknown>): Promise<string> {
  const requests: Request[] = [];
  const client = createClient({
    baseUrl: "https://api.example",
    fetch: async (request) => {
      requests.push(request);
      return Response.json({});
    },
  });
  await (client.GET as (path: string, init: unknown) => Promise<unknown>)(path, { params });
  return requests[0]?.url ?? "";
}

afterEach(() => {
  expect(Object.prototype).not.toHaveProperty("polluted");
});

describe("prototype keys in parameters", () => {
  it("a query __proto__ key is sent as a name", async () => {
    const query = fromJson('{"__proto__": "x", "constructor": "y"}');

    expect(await sentURL("/s", { query })).toBe("https://api.example/s?__proto__=x&constructor=y");
  });

  it("a nested __proto__ object is refused like any nested object", async () => {
    const query = fromJson('{"filter": {"__proto__": {"polluted": 1}}}');

    await expect(sentURL("/s", { query })).rejects.toThrow("Deeply-nested arrays/objects");
  });

  it("a path object with a __proto__ key stays in its segment", async () => {
    const path = { id: fromJson('{"__proto__": "a/b"}') };

    expect(await sentURL("/u/{id}", { path })).toBe("https://api.example/u/__proto__,a%2Fb");
  });

  it("a header named __proto__ is sent as a header", async () => {
    const requests: Request[] = [];
    const client = createClient({
      fetch: async (request) => {
        requests.push(request);
        return Response.json({});
      },
    });

    await (client.GET as (path: string, init: unknown) => Promise<unknown>)(
      "https://api.example/h",
      {
        headers: fromJson('{"__proto__": "v"}'),
      },
    );

    expect(requests[0]?.headers.get("__proto__")).toBe("v");
  });
});
