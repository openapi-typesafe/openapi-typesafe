import { Readable } from "node:stream";
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

/** A client that records the init it gives `Request`; a platform Request hides some options. */
function initRecordingClient() {
  const inits: RequestInit[] = [];
  const client = createClient<Paths>({
    baseUrl: BASE_URL,
    Request: class extends Request {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init);
        inits.push(init ?? {});
      }
    },
    fetch: async () => Response.json({ ok: true }),
  });
  return { client, inits };
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

  it("a ReadableStream body is sent as its bytes, without a JSON content type", async () => {
    const stream = new Blob(["streamed bytes"]).stream();

    const request = await sentRequest(stream, { "Content-Type": "application/octet-stream" });

    expect(await request.text()).toBe("streamed bytes");
    expect(request.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("a ReadableStream body gets duplex half, which the Fetch standard requires", async () => {
    const { client, inits } = initRecordingClient();

    await client.POST("/upload", { body: new Blob(["streamed bytes"]).stream() });

    expect(inits).toHaveLength(1);
    expect(inits[0]).toMatchObject({ duplex: "half" });
    expect(new Headers(inits[0]?.headers).get("Content-Type")).toBeNull();
  });

  it.each([
    [
      "an async generator",
      () =>
        (async function* () {
          yield new TextEncoder().encode("gen");
        })(),
    ],
    ["a Node.js Readable", () => Readable.from([Buffer.from("gen")])],
  ])("%s body is streamed with duplex half, not JSON-encoded", async (_name, createBody) => {
    const { client, inits } = initRecordingClient();
    const body = createBody();

    await client.POST("/upload", { body });

    expect(inits[0]).toMatchObject({ duplex: "half", body });
    expect(new Headers(inits[0]?.headers).get("Content-Type")).toBeNull();
  });

  it("a Node.js Readable body is sent as its bytes", async () => {
    const request = await sentRequest(Readable.from([Buffer.from("node "), Buffer.from("bytes")]));

    expect(await request.text()).toBe("node bytes");
  });

  it("a body that is not a stream gets no duplex", async () => {
    const { client, inits } = initRecordingClient();

    await client.POST("/upload", { body: new Blob(["bytes"]) });

    expect(inits[0]).toMatchObject({ duplex: undefined });
  });

  it("defaultBodySerializer returns a ReadableStream as it is", () => {
    const stream = new Blob(["x"]).stream();

    expect(defaultBodySerializer(stream)).toBe(stream);
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
    expect(defaultBodySerializer({ ids: [1, 2], n: 0, b: false }, FORM_HEADERS)).toBe(
      "ids=1%2C2&n=0&b=false",
    );
  });

  it("defaultBodySerializer leaves out null and undefined fields, as in a multipart body", () => {
    expect(defaultBodySerializer({ a: undefined, b: null, c: "1" }, FORM_HEADERS)).toBe("c=1");
  });

  it.each([
    "application/x-www-form-urlencoded; charset=UTF-8",
    "Application/X-WWW-Form-Urlencoded",
  ])("defaultBodySerializer encodes a form for the content type %j", (contentType) => {
    expect(defaultBodySerializer({ a: "1" }, { "Content-Type": contentType })).toBe("a=1");
  });

  it("defaultBodySerializer keeps JSON for a content type that only starts like a form", () => {
    const contentType = "application/x-www-form-urlencoded-json";

    expect(defaultBodySerializer({ a: "1" }, { "Content-Type": contentType })).toBe('{"a":"1"}');
  });

  it("defaultBodySerializer keeps a string form body", () => {
    expect(defaultBodySerializer("a=1&b=2", FORM_HEADERS)).toBe("a=1&b=2");
  });

  it("a form body with a charset parameter is sent as a form", async () => {
    const contentType = "application/x-www-form-urlencoded; charset=UTF-8";

    const request = await sentRequest({ a: 1, b: null }, { "Content-Type": contentType });

    expect(await request.text()).toBe("a=1");
    expect(request.headers.get("Content-Type")).toBe(contentType);
  });

  it("defaultBodySerializer sends a Date field as ISO 8601, alone or in an array", () => {
    const at = new Date("2026-11-08T12:30:00.000Z");

    expect(defaultBodySerializer({ at, all: [at, at] }, FORM_HEADERS)).toBe(
      "at=2026-11-08T12%3A30%3A00.000Z&all=2026-11-08T12%3A30%3A00.000Z%2C2026-11-08T12%3A30%3A00.000Z",
    );
  });

  it("defaultBodySerializer rejects a nested object instead of sending [object Object]", () => {
    expect(() => defaultBodySerializer({ a: { b: 1 } }, FORM_HEADERS)).toThrow("bodySerializer");
  });

  it.each([
    ["an array of objects", { tags: [{ id: 1 }, { id: 2 }] }],
    ["a nested array", { m: [[1, 2], [3]] }],
  ])("defaultBodySerializer rejects %s instead of flattening it", (_name, body) => {
    expect(() => defaultBodySerializer(body, FORM_HEADERS)).toThrow(
      "Nested form values need your own `bodySerializer()`.",
    );
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
