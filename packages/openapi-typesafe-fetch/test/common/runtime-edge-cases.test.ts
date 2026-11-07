import { describe, expect, it } from "vitest";
import createClient, {
  createPathBasedClient,
  createQuerySerializer,
  defaultBodySerializer,
  type Middleware,
  serializeArrayParam,
  serializeObjectParam,
  serializePrimitiveParam,
} from "../../src/index.js";

/** Runtime branches the feature tests do not reach: guards, invalid middleware results, serializers. */

type Operation = { responses: { 200: { content: { "application/json": { ok: boolean } } } } };
type Paths = {
  "/items": Record<
    "get" | "put" | "post" | "delete" | "options" | "head" | "patch" | "trace",
    Operation
  >;
};

const BASE_URL = "https://api.example.com";
const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";

/** Options for a client whose fetch records each request and answers `{ ok: true }`. */
function recordingOptions(methods: string[]) {
  return {
    baseUrl: BASE_URL,
    fetch: async (request: Request) => {
      methods.push(request.method);
      return Response.json({ ok: true });
    },
  };
}

function failingClient(onRequest: Middleware["onRequest"], onError?: Middleware["onError"]) {
  const client = createClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async () => {
      throw new TypeError("network down");
    },
  });
  client.use({ onRequest, onError } as Middleware);
  return client;
}

describe("path based client", () => {
  it("every method forwards to the core client with its HTTP method", async () => {
    const methods: string[] = [];
    const client = createPathBasedClient<Paths>(recordingOptions(methods));
    const items = client["/items"];

    await items.PUT({});
    await items.POST({});
    await items.DELETE({});
    await items.OPTIONS({});
    await items.HEAD({});
    await items.PATCH({});

    expect(methods).toEqual(["PUT", "POST", "DELETE", "OPTIONS", "HEAD", "PATCH"]);
  });

  it("TRACE forwards to the core client, where the Fetch API rejects the method", async () => {
    const client = createPathBasedClient<Paths>(recordingOptions([]));

    // The Fetch standard forbids TRACE in `new Request()`; the client does not hide that.
    await expect(client["/items"].TRACE({})).rejects.toThrow(/TRACE/);
  });
});

describe("middleware registration", () => {
  it("use skips empty entries and eject ignores unknown middleware", async () => {
    const methods: string[] = [];
    const client = createClient<Paths>(recordingOptions(methods));

    client.use(undefined as never, { onRequest() {} });
    client.eject({ onRequest() {} });
    await client.GET("/items");

    expect(methods).toEqual(["GET"]);
  });

  it("use with an object without hooks throws", () => {
    const client = createClient<Paths>(recordingOptions([]));

    expect(() => client.use({} as Middleware)).toThrow(
      "Middleware must be an object with one of `onRequest()`, `onResponse()` or `onError()`",
    );
  });
});

describe("middleware results", () => {
  it("onRequest returning something else than Request or Response throws", async () => {
    const client = createClient<Paths>(recordingOptions([]));
    client.use({ onRequest: () => "nope" as never });

    await expect(client.GET("/items")).rejects.toThrow(/onRequest: must return/);
  });

  it("onResponse returning something else than Response throws", async () => {
    const client = createClient<Paths>(recordingOptions([]));
    client.use({ onResponse: () => "nope" as never });

    await expect(client.GET("/items")).rejects.toThrow(/onResponse: must return/);
  });

  it("onError returning an Error rejects with that error", async () => {
    const replacement = new Error("replaced");
    const client = failingClient(undefined, () => replacement);

    await expect(client.GET("/items")).rejects.toBe(replacement);
  });

  it("onError returning something else than Response or Error throws", async () => {
    const client = failingClient(undefined, () => "nope" as never);

    await expect(client.GET("/items")).rejects.toThrow(/onError: must return/);
  });

  it("a fetch failure with only an onRequest middleware rejects with the fetch error", async () => {
    const client = failingClient(() => undefined);

    await expect(client.GET("/items")).rejects.toThrow("network down");
  });
});

describe("empty responses", () => {
  it("an empty error response returns error undefined", async () => {
    const client = createClient<Paths>({
      baseUrl: BASE_URL,
      fetch: async () => new Response(null, { status: 404, headers: { "Content-Length": "0" } }),
    });

    const result = await client.GET("/items");

    expect(result.error).toBeUndefined();
    expect(result.response.status).toBe(404);
  });
});

describe("serializers", () => {
  it("serializePrimitiveParam returns an empty string for null and throws for objects", () => {
    expect(serializePrimitiveParam("a", null as never)).toBe("");
    expect(() => serializePrimitiveParam("a", {} as never)).toThrow(/Deeply-nested/);
  });

  it("serializeObjectParam returns an empty string for a non-object", () => {
    const options = { style: "form", explode: true } as const;

    expect(serializeObjectParam("a", "x" as never, options)).toBe("");
  });

  it("serializeObjectParam with explode false and allowReserved keeps reserved characters", () => {
    const options = { style: "form", explode: false, allowReserved: true } as const;

    expect(serializeObjectParam("a", { b: "x/y" }, options)).toBe("a=b,x/y");
  });

  it("serializeArrayParam returns an empty string for a non-array", () => {
    const options = { style: "form", explode: true } as const;

    expect(serializeArrayParam("a", "x" as never, options)).toBe("");
  });

  it("serializeArrayParam with allowReserved keeps reserved characters", () => {
    const joined = { style: "form", explode: false, allowReserved: true } as const;
    const label = { style: "label", explode: true, allowReserved: true } as const;

    expect(serializeArrayParam("a", ["x/y", "z"], joined)).toBe("a=x/y,z");
    expect(serializeArrayParam("a", ["x/y", "z"], label)).toBe(".x/y.z");
  });

  it("createQuerySerializer returns an empty string for a non-object", () => {
    expect(createQuerySerializer()("x" as never)).toBe("");
  });

  it("defaultBodySerializer without headers returns JSON", () => {
    expect(defaultBodySerializer({ a: 1 })).toBe('{"a":1}');
  });

  it("defaultBodySerializer with plain-object form headers returns form data", () => {
    expect(defaultBodySerializer({ a: "1" }, { "content-type": FORM_CONTENT_TYPE })).toBe("a=1");
  });
});
