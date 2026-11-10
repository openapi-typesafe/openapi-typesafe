import { afterEach, describe, expect, it, vi } from "vitest";
import createClient, { defaultBodySerializer } from "../../src/index.js";

/**
 * Body classes a platform installs as globals that lack what the classes of browsers and Node.js
 * have. The FormData, Blob and URLSearchParams of React Native have no type tag and no `entries`
 * or `arrayBuffer`; the Blob and File of jsdom 20 (Jest 29) have the tag but no `arrayBuffer`.
 * The client told a body by its tag and methods only, so it JSON-encoded them.
 */

type Paths = {
  "/upload": {
    post: {
      requestBody: { content: { "multipart/form-data": { name: string } } };
      responses: { 200: { content: { "application/json": { ok: number } } } };
    };
  };
};

/** React Native's FormData: parts in `_parts`, read by its own fetch; no tag, no `entries`. */
class NativeFormData {
  readonly _parts: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this._parts.push([name, value]);
  }
}

/** React Native's Blob: a handle to native data, with no tag and no `arrayBuffer`. */
class NativeBlob {
  readonly _data = { blobId: "blob-1", offset: 0, size: 3 };
  get size() {
    return this._data.size;
  }
}

/** React Native's URLSearchParams, with no tag. */
class NativeSearchParams {
  toString() {
    return "a=1";
  }
}

/** jsdom 20's Blob: the right type tag, but no `arrayBuffer`. */
class TaggedBlobWithoutArrayBuffer {
  get [Symbol.toStringTag]() {
    return "Blob";
  }
}

/** A `Request` that keeps the body and headers as the client sets them. */
class RecordedRequest {
  readonly headers: Headers;
  readonly body: unknown;
  constructor(_url: string, init: RequestInit) {
    this.headers = new Headers(init.headers);
    this.body = init.body;
  }
}

function recordingClient() {
  const requests: RecordedRequest[] = [];
  const client = createClient<Paths>({
    baseUrl: "https://api.example.com",
    Request: RecordedRequest as unknown as typeof Request,
    fetch: async (request) => {
      requests.push(request as unknown as RecordedRequest);
      return Response.json({ ok: 1 });
    },
  });
  return { client, requests };
}

/** A body of a class the request body type does not name, as an app passes one. */
function asBody(value: object): { name: string } {
  return value as { name: string };
}

describe("body classes of React Native and jsdom", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a React Native FormData body is sent as it is, with no Content-Type", async () => {
    vi.stubGlobal("FormData", NativeFormData);
    const { client, requests } = recordingClient();
    const form = new NativeFormData();
    form.append("name", "photo");

    await client.POST("/upload", { body: asBody(form) });

    expect(requests[0]?.body).toBe(form);
    expect(requests[0]?.headers.get("Content-Type")).toBeNull();
  });

  it("a multipart object body becomes a React Native FormData with the platform's type", async () => {
    vi.stubGlobal("FormData", NativeFormData);
    const { client, requests } = recordingClient();

    await client.POST("/upload", {
      body: { name: "photo" },
      headers: { "Content-Type": "multipart/form-data" },
    });

    const body = requests[0]?.body;
    expect(body).toBeInstanceOf(NativeFormData);
    expect(body instanceof NativeFormData && body._parts).toEqual([["name", "photo"]]);
    expect(requests[0]?.headers.get("Content-Type")).toBeNull();
  });

  it("a React Native Blob body is sent as it is, with no Content-Type", async () => {
    vi.stubGlobal("Blob", NativeBlob);
    const { client, requests } = recordingClient();
    const blob = new NativeBlob();

    await client.POST("/upload", { body: asBody(blob) });

    expect(requests[0]?.body).toBe(blob);
    expect(requests[0]?.headers.get("Content-Type")).toBeNull();
  });

  it("a React Native URLSearchParams body is sent as it is", async () => {
    vi.stubGlobal("URLSearchParams", NativeSearchParams);
    const params = new NativeSearchParams();

    expect(defaultBodySerializer(params)).toBe(params);
  });

  it("a jsdom 20 Blob without arrayBuffer is sent as it is", () => {
    vi.stubGlobal("Blob", TaggedBlobWithoutArrayBuffer);
    const blob = new TaggedBlobWithoutArrayBuffer();

    expect(defaultBodySerializer(blob)).toBe(blob);
  });

  it("a plain object with a Blob tag but no methods is still JSON", () => {
    const forged = new TaggedBlobWithoutArrayBuffer();

    expect(defaultBodySerializer(forged)).toBe("{}");
  });
});
