import { describe, expect, it } from "vitest";
import createClient, { createFinalURL, defaultBodySerializer } from "../../src/index.js";

/**
 * Request bodies and URLs (ADR-013, decisions 6 to 8). JSON-encoding a `Blob` or an `ArrayBuffer`
 * sent `{}`, a nested form value was sent as `[object Object]`, and a path with a query string got
 * a second `?`.
 */

type Paths = {
  "/upload": {
    post: {
      requestBody: { content: { "application/octet-stream": unknown } };
      responses: { 200: { content: { "application/json": { ok: boolean } } } };
    };
  };
};

const BASE_URL = "https://api.example.com";

async function sentRequest(body: unknown, headers: Record<string, string> = {}): Promise<Request> {
  const requests: Request[] = [];
  const client = createClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async (request) => {
      requests.push(request);
      return Response.json({ ok: true });
    },
  });
  await client.POST("/upload", { body, headers });
  const [request] = requests;
  if (!request) {
    throw new Error("the client sent no request");
  }
  return request;
}

describe("raw request bodies", () => {
  it("a Blob body is sent as its bytes with its own type", async () => {
    const request = await sentRequest(new Blob(["blob body"], { type: "text/plain" }));

    expect(await request.text()).toBe("blob body");
    expect(request.headers.get("Content-Type")).toBe("text/plain");
  });

  it.each([
    ["an ArrayBuffer", new Uint8Array([1, 2, 255]).buffer],
    ["a Uint8Array", new Uint8Array([1, 2, 255])],
  ])("%s body is sent as its bytes without a JSON content type", async (_name, body) => {
    const request = await sentRequest(body, { "Content-Type": "application/octet-stream" });

    expect([...new Uint8Array(await request.arrayBuffer())]).toEqual([1, 2, 255]);
    expect(request.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("a URLSearchParams body is sent as a form", async () => {
    const request = await sentRequest(new URLSearchParams({ a: "1", b: "x y" }));

    expect(await request.text()).toBe("a=1&b=x+y");
    expect(request.headers.get("Content-Type")).toContain("application/x-www-form-urlencoded");
  });
});

describe("form bodies", () => {
  const FORM_HEADERS = { "Content-Type": "application/x-www-form-urlencoded" };

  it("defaultBodySerializer keeps arrays and primitives as before", () => {
    expect(defaultBodySerializer({ ids: [1, 2], n: null }, FORM_HEADERS)).toBe("ids=1%2C2&n=null");
  });

  it("defaultBodySerializer rejects a nested object instead of sending [object Object]", () => {
    expect(() => defaultBodySerializer({ a: { b: 1 } }, FORM_HEADERS)).toThrow("bodySerializer");
  });
});

describe("createFinalURL", () => {
  it("createFinalURL appends query parameters to a path that has a query string", () => {
    const url = createFinalURL("/items?fixed=1", {
      baseUrl: BASE_URL,
      params: { query: { a: 2 } },
      querySerializer: (query) => `a=${String(query.a)}`,
      pathSerializer: (path) => path,
    });

    expect(url).toBe(`${BASE_URL}/items?fixed=1&a=2`);
  });
});
