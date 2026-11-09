import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { FormData as UndiciFormData, Request as UndiciRequest, fetch as undiciFetch } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import createClient from "../../src/index.js";

/**
 * Bodies from another Fetch API implementation or realm. The client told a FormData, a Blob or a
 * stream by `instanceof` of this realm's classes, so a FormData from the `undici` package was
 * JSON-encoded as `{}`, and the multipart body the client builds reached undici's `Request` as the
 * text `[object FormData]`.
 */

type Paths = {
  "/upload": {
    post: {
      requestBody: { content: { "multipart/form-data": Record<string, unknown> } };
      responses: { 200: { content: { "application/json": Received } } };
    };
  };
};

interface Received {
  readonly contentType: string | null;
  readonly body: string;
}

async function echo(request: IncomingMessage, response: ServerResponse): Promise<void> {
  let body = "";
  for await (const chunk of request) {
    body += String(chunk);
  }
  const received: Received = { contentType: request.headers["content-type"] ?? null, body };
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(received));
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => void echo(request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

/** The undici setup of the docs, with its FormData class. */
function undiciClient() {
  return createClient<Paths>({
    baseUrl,
    fetch: undiciFetch,
    Request: UndiciRequest,
    FormData: UndiciFormData,
  });
}

/** The undici package types differ from the DOM lib types; the runtime objects are the same kind. */
function asDom<T>(value: unknown): T {
  return value as T;
}

/**
 * A Blob of another implementation, like the `fetch-blob` package: `fetch` reads it by its type tag
 * and its methods, and it is no instance of this realm's `Blob`.
 */
class ForeignBlob {
  readonly type = "text/plain";
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  get [Symbol.toStringTag](): string {
    return "Blob";
  }

  get size(): number {
    return this.#text.length;
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    return new Response(this.#text).arrayBuffer();
  }
}

describe("bodies of another implementation", () => {
  it("an undici FormData body is sent as multipart with the platform's boundary", async () => {
    const form = new UndiciFormData();
    form.append("name", "photo");

    const { data } = await undiciClient().POST("/upload", { body: asDom(form) });

    expect(data?.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(data?.body).toContain('name="name"\r\n\r\nphoto');
  });

  it("a multipart object body is built as a FormData of the FormData option", async () => {
    const { data } = await undiciClient().POST("/upload", {
      headers: { "Content-Type": "multipart/form-data" },
      body: { description: "Me", file: new File(["PNG"], "avatar.png") },
    });

    expect(data?.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(data?.body).toContain('name="description"\r\n\r\nMe');
    expect(data?.body).toContain('filename="avatar.png"');
  });

  it("a FormData of this realm with the undici Request is sent as a copy of undici's class", async () => {
    const form = new FormData();
    form.append("name", "photo");

    const { data } = await undiciClient().POST("/upload", {
      body: asDom(form),
      headers: { "Content-Type": "multipart/form-data; boundary=written-by-hand" },
    });

    expect(data?.contentType).not.toContain("written-by-hand");
    expect(data?.body).toContain('name="name"\r\n\r\nphoto');
  });
});

/**
 * The `Request` of a runtime that takes a Blob of another realm (an iframe in a browser). Node.js
 * takes none, so this one records the init the client gives it and builds the request without it.
 */
function recordingRequestClass(inits: RequestInit[]): typeof Request {
  return class RecordingRequest extends Request {
    constructor(input: RequestInfo | URL, init: RequestInit = {}) {
      inits.push(init);
      super(input, { ...init, body: null, duplex: undefined } as RequestInit);
    }
  };
}

describe("a Blob of another realm", () => {
  it("is given to the Request as it is, without a JSON Content-Type", async () => {
    const inits: RequestInit[] = [];
    const client = createClient<Paths>({
      baseUrl,
      Request: recordingRequestClass(inits),
      fetch: async () => Response.json({ contentType: null, body: "" }),
    });
    const blob = new ForeignBlob("raw");

    await client.POST("/upload", { body: asDom(blob) });

    expect(inits[0]?.body).toBe(blob);
    expect(new Headers(inits[0]?.headers).get("content-type")).toBeNull();
  });
});
