import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedoclySchemaLoader } from "../../src/adapters/redocly-loader/redocly-schema-loader.js";
import type { RemoteDocumentLimits } from "../../src/adapters/redocly-loader/remote-fetch.js";
import { DEFAULT_REMOTE_DOCUMENT_LIMITS, defaultRedoclyConfig } from "../../src/api/default-ports.js";
import type { OpenAPITypesafeError } from "../../src/domain/errors.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { documentWith } from "./defensive-helpers.js";

/** The time limit of the tests that wait for it: short, so that they stay fast. */
const TEST_TIMEOUT_MS = 500;
/**
 * The time limit of every other test: long enough for a busy CI machine to fetch, decode and parse
 * a 4 MiB document, which can take more than TEST_TIMEOUT_MS on a Windows runner.
 */
const LOAD_TIMEOUT_MS = 10_000;

const PERSON = JSON.stringify({ type: "object", properties: { name: { type: "string" } } });
const UNSUPPORTED_KEY = JSON.stringify({ type: "object", properties: { valueOf: { type: "string" } } });

/** How often the slow route sends one more byte: well inside the timeout, so only a total limit stops it. */
const DRIP_INTERVAL_MS = 50;
const drips = new Set<NodeJS.Timeout>();

/** Answer at once, then send the body one space at a time and never finish it. */
function drip(response: ServerResponse): void {
  response.writeHead(200, { "content-type": "application/json" });
  const timer = setInterval(() => response.write(" "), DRIP_INTERVAL_MS);
  drips.add(timer);
  response.on("close", () => clearInterval(timer));
}

/** Refs in each fan-out document: each one names a new document, so the fan-out never ends. */
const FAN_OUT = 10;
/** How long a fan-out answer waits, so that parallel fetches overlap at the server. */
const FAN_DELAY_MS = 10;
const fanRequests = { total: 0, inFlight: 0, maxInFlight: 0 };

/** A document whose properties are $refs to FAN_OUT more documents below its own path. */
function fan(request: IncomingMessage, response: ServerResponse): void {
  fanRequests.total += 1;
  fanRequests.inFlight += 1;
  fanRequests.maxInFlight = Math.max(fanRequests.maxInFlight, fanRequests.inFlight);
  const base = (request.url ?? "").replace(/\.json$/, "");
  const properties = Object.fromEntries(
    Array.from({ length: FAN_OUT }, (_, index) => [`p${index}`, { $ref: `${base}/${index}.json` }]),
  );
  setTimeout(() => {
    fanRequests.inFlight -= 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ type: "object", properties }));
  }, FAN_DELAY_MS);
}

/** A JSON schema padded with spaces to 4 MiB, sent gzip-compressed: about 4 KiB on the wire. */
const PADDED_BYTES = 4 * 1024 * 1024;
const GZIP_BOMB = gzipSync(`${PERSON}${" ".repeat(PADDED_BYTES)}`);

/** A JSON schema with an array of DENSE_NODES empty objects: few bytes, many parsed nodes. */
const DENSE_NODES = 2000;
const DENSE = JSON.stringify({ type: "object", "x-pad": Array.from({ length: DENSE_NODES }, () => ({})) });

function gzipBomb(response: ServerResponse): void {
  response.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
  response.end(GZIP_BOMB);
}

/** Paths whose first request had its connection closed; the next request is answered. */
const closedOnce = new Set<string>();
const closedConnections = { once: 0, reset: 0 };

/**
 * Close the connection of the first request for each path before any response, as a server does
 * that closed a kept-alive connection the client had not seen close yet; answer the next one.
 */
function closeOnce(request: IncomingMessage, response: ServerResponse): void {
  const url = request.url ?? "";
  if (!closedOnce.has(url)) {
    closedOnce.add(url);
    closedConnections.once += 1;
    request.socket.destroy();
    return;
  }
  const body = url.endsWith("/root.json")
    ? JSON.stringify(documentWith({ Person: { $ref: "./person.json" } }))
    : PERSON;
  response.writeHead(200, { "content-type": "application/json" }).end(body);
}

/** Close the connection of every request before any response. */
function reset(request: IncomingMessage): void {
  closedConnections.reset += 1;
  request.socket.destroy();
}

/** The routes of the local server: a schema, a missing file, a redirect loop, no answer and a slow body. */
function answer(request: IncomingMessage, response: ServerResponse): void {
  // A Map, so a request path such as `/constructor` cannot reach an object prototype method.
  const routes = new Map<string, () => void>(
    Object.entries({
      "/person.json": () => response.writeHead(200, { "content-type": "application/json" }).end(PERSON),
      "/unsupported-key.json": () =>
        response.writeHead(200, { "content-type": "application/json" }).end(UNSUPPORTED_KEY),
      "/loop.json": () => response.writeHead(302, { location: "/loop.json" }).end(),
      "/hang.json": () => undefined,
      "/drip.json": () => drip(response),
      "/bomb.json": () => gzipBomb(response),
      "/bomb-2.json": () => gzipBomb(response),
      "/dense.json": () => response.writeHead(200, { "content-type": "application/json" }).end(DENSE),
      "/dense.yaml": () => response.writeHead(200, { "content-type": "text/plain" }).end(DENSE),
      "/dense.txt": () => response.writeHead(200, { "content-type": "text/plain" }).end(DENSE),
      "/schemas/person": () => response.writeHead(200, { "content-type": "text/plain" }).end(PERSON),
      "/text/person.yaml": () => response.writeHead(200, { "content-type": "text/plain" }).end(PERSON),
      ...Object.fromEntries(Object.entries(REDIRECT_ROUTES).map(([route, send]) => [route, () => send(response)])),
    }),
  );
  if (request.url?.startsWith("/fan/")) {
    fan(request, response);
    return;
  }
  if (request.url?.startsWith("/closed-once/")) {
    closeOnce(request, response);
    return;
  }
  if (request.url?.startsWith("/other/versioned?")) {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ type: "integer" }));
    return;
  }
  if (request.url?.startsWith("/versioned?")) {
    const version = new URL(request.url, "http://localhost").searchParams.get("v");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ type: "string", description: version }));
    return;
  }
  if (request.url === "/reset.json") {
    reset(request);
    return;
  }
  // The query is for the tests of secrets in URLs; the route is the path.
  const route = routes.get((request.url ?? "").split("?")[0] ?? "");
  // The explicit check is the guard CodeQL expects before calling a handler chosen by a request.
  if (typeof route !== "function") {
    response.writeHead(404).end("Not Found");
    return;
  }
  route();
}

/** A JSON answer of the redirect routes. */
const json = (body: unknown) => (response: ServerResponse) =>
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
const redirect = (location: string) => (response: ServerResponse) => response.writeHead(302, { location }).end();

/**
 * A spec URL that redirects to a versioned file, and a `$ref` that redirects to a moved file. Each
 * has a relative `$ref`; a file at the old place answers too, so a wrong base loads other types.
 */
const REDIRECT_ROUTES: Record<string, (response: ServerResponse) => void> = {
  "/latest": redirect("/static/v1/root.json"),
  "/static/v1/root.json": json(documentWith({ Pet: { $ref: "./schemas/pet.json" } })),
  "/static/v1/schemas/pet.json": json({ type: "object", properties: { v1only: { type: "string" } } }),
  "/schemas/pet.json": json({ type: "object", properties: { wrong: { type: "string" } } }),
  "/moved/tag.json": redirect("/static/v1/schemas/tag.json"),
  "/static/v1/schemas/tag.json": json({ $ref: "./tag-name.json" }),
  "/static/v1/schemas/tag-name.json": json({ type: "string", description: "v1" }),
  "/moved/tag-name.json": json({ type: "integer" }),
};

let server: Server;
let baseURL: string;

beforeAll(async () => {
  server = createServer(answer);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const timer of drips) {
    clearInterval(timer);
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

interface LoadOptions {
  readonly limits?: RemoteDocumentLimits;
  readonly redoc?: Awaited<ReturnType<typeof defaultRedoclyConfig>>;
  readonly logger?: RecordingLogger;
  readonly timeoutMs?: number;
}

async function loadDocument(source: unknown, options: LoadOptions = {}) {
  const loader = createRedoclySchemaLoader({
    redoc: options.redoc ?? (await defaultRedoclyConfig()),
    logger: options.logger ?? new RecordingLogger(),
    now: () => 0,
    remoteRefTimeoutMs: options.timeoutMs ?? LOAD_TIMEOUT_MS,
    remoteDocumentLimits: options.limits ?? DEFAULT_REMOTE_DOCUMENT_LIMITS,
  });
  const loaded = await loader.load({
    source: source as never,
    cwd: pathToFileURL(`${path.resolve("/work")}${path.sep}`),
    shouldLint: true,
    refAccess: {},
  });
  return loaded.document;
}

async function loadFailure(source: unknown, options: LoadOptions = {}): Promise<OpenAPITypesafeError> {
  try {
    await loadDocument(source, options);
  } catch (error) {
    return error as OpenAPITypesafeError;
  }
  throw new Error("The load should have failed");
}

const withRemoteRef = (path: string) => documentWith({ Person: { $ref: `${baseURL}${path}` } });

describe("remote $ref", () => {
  it("a remote $ref is bundled into the document", async () => {
    const bundled = await loadDocument(withRemoteRef("/person.json"));

    expect(bundled.components?.schemas).toEqual({
      Person: { $ref: "#/components/schemas/person" },
      person: JSON.parse(PERSON),
    });
  });

  it.each([
    ["a path without an extension", "/schemas/person"],
    ["a query after the extension", "/text/person.yaml?v=1"],
  ])("a remote $ref to %s served as text/plain is parsed as a document", async (_name, path) => {
    const bundled = await loadDocument(withRemoteRef(path));

    expect(bundled.components?.schemas?.person).toEqual(JSON.parse(PERSON));
  });

  it("a remote $ref whose scheme is written in uppercase is bundled as a URL", async () => {
    const document = documentWith({ Person: { $ref: `${baseURL.replace("http:", "HTTP:")}/person.json` } });

    const bundled = await loadDocument(document);

    expect(bundled.components?.schemas?.person).toEqual(JSON.parse(PERSON));
  });

  it.each([
    ["is missing", "/missing.json"],
    ["redirects to itself", "/loop.json"],
    ["never answers", "/hang.json"],
    ["sends its body one byte at a time forever", "/drip.json"],
  ])("a remote $ref that %s fails with SCHEMA_INVALID within the time limit", async (_name, path) => {
    const startedAt = performance.now();

    const error = await loadFailure(withRemoteRef(path), { timeoutMs: TEST_TIMEOUT_MS });

    expect(error.code).toBe("SCHEMA_INVALID");
    expect(error.message).toMatch(/^Can't resolve \$ref: .* at #\/components\/schemas\/Person$/);
    expect(performance.now() - startedAt).toBeLessThan(TEST_TIMEOUT_MS * 10);
  });

  it("a remote source that never answers fails with SCHEMA_LOAD_FAILED and names the limit", async () => {
    const error = await loadFailure(new URL(`${baseURL}/hang.json`), { timeoutMs: TEST_TIMEOUT_MS });

    expect(error).toMatchObject({ code: "SCHEMA_LOAD_FAILED" });
    expect(error.message).toBe(`Timed out after ${TEST_TIMEOUT_MS} ms loading ${baseURL}/hang.json`);
  });

  it("a remote source that sends its body one byte at a time fails within the time limit", async () => {
    const error = await loadFailure(new URL(`${baseURL}/drip.json`), { timeoutMs: TEST_TIMEOUT_MS });

    expect(error).toMatchObject({ code: "SCHEMA_LOAD_FAILED" });
    expect(error.message).toBe(`Timed out after ${TEST_TIMEOUT_MS} ms loading ${baseURL}/drip.json`);
  });

  it("a refused connection keeps the network reason as the cause", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    const error = await loadFailure(new URL(`http://127.0.0.1:${port}/a.json`));

    expect(error).toMatchObject({ code: "SCHEMA_LOAD_FAILED", message: "fetch failed" });
    expect((error.cause as Error).cause).toMatchObject({ code: "ECONNREFUSED" });
  });

  it("a document whose connection closed before any response is fetched once more", async () => {
    const bundled = await loadDocument(new URL(`${baseURL}/closed-once/root.json`));

    expect(bundled.components?.schemas).toEqual({
      Person: { $ref: "#/components/schemas/person" },
      person: JSON.parse(PERSON),
    });
    expect(closedConnections.once).toBe(2);
  });

  it("a connection that closes before every response fails after one more attempt", async () => {
    const error = await loadFailure(new URL(`${baseURL}/reset.json`));

    expect(error).toMatchObject({ code: "SCHEMA_LOAD_FAILED", message: "fetch failed" });
    expect(closedConnections.reset).toBe(2);
  });

  it("an unsupported key in a remote document names that document", async () => {
    const error = await loadFailure(withRemoteRef("/unsupported-key.json"));

    expect(error).toMatchObject({
      code: "SCHEMA_KEY_UNSUPPORTED",
      details: {
        keys: [{ key: "valueOf", pointer: "#/properties/valueOf", source: `${baseURL}/unsupported-key.json` }],
      },
    });
  });
});

describe("remote $ref fan-out", () => {
  const limits: RemoteDocumentLimits = { ...DEFAULT_REMOTE_DOCUMENT_LIMITS, maxDocuments: 50, maxParallelFetches: 4 };

  it("a fan-out of remote documents stops at the document limit with SCHEMA_REF_FORBIDDEN", async () => {
    fanRequests.total = 0;

    const error = await loadFailure(withRemoteRef("/fan/root.json"), { limits });

    expect(error).toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { reason: "too-many-remote-documents", maxDocuments: limits.maxDocuments },
    });
    expect(error.message).toContain("more than 50 remote documents");
    expect(fanRequests.total).toBe(limits.maxDocuments);
  });

  it("remote documents are fetched at most a few at a time", async () => {
    fanRequests.maxInFlight = 0;

    await loadFailure(withRemoteRef("/fan/root.json"), { limits });

    expect(fanRequests.maxInFlight).toBeGreaterThan(1);
    expect(fanRequests.maxInFlight).toBeLessThanOrEqual(limits.maxParallelFetches);
  });
});

describe("remote documents that are too large once decoded (RC4 S4)", () => {
  const MEBIBYTE = 1024 * 1024;
  const limits: RemoteDocumentLimits = {
    ...DEFAULT_REMOTE_DOCUMENT_LIMITS,
    maxDocumentBytes: MEBIBYTE,
    maxTotalBytes: 6 * MEBIBYTE,
  };

  it("a gzip bomb behind a remote $ref stops at the document limit", async () => {
    const error = await loadFailure(withRemoteRef("/bomb.json"), { limits });

    expect(error).toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { ref: `${baseURL}/bomb.json`, reason: "remote-document-too-large", maxDocumentBytes: MEBIBYTE },
    });
  });

  it("a gzip bomb as the remote root document stops at the document limit", async () => {
    const error = await loadFailure(new URL(`${baseURL}/bomb.json`), { limits });

    expect(error).toMatchObject({ code: "SCHEMA_REF_FORBIDDEN", details: { reason: "remote-document-too-large" } });
  });

  it("remote documents within the document limit stop at the total of the run", async () => {
    const both = documentWith({
      A: { $ref: `${baseURL}/bomb.json` },
      B: { $ref: `${baseURL}/bomb-2.json` },
    });

    const error = await loadFailure(both, { limits: { ...limits, maxDocumentBytes: 5 * MEBIBYTE } });

    expect(error).toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { reason: "remote-documents-too-large", maxTotalBytes: 6 * MEBIBYTE },
    });
  });

  it("a customFetch of the Redocly config is limited too", async () => {
    const redoc = await defaultRedoclyConfig();
    (redoc.resolve.http as { customFetch?: unknown }).customFetch = fetch;

    const error = await loadFailure(withRemoteRef("/bomb.json"), { limits, redoc });

    expect(error).toMatchObject({ code: "SCHEMA_REF_FORBIDDEN", details: { reason: "remote-document-too-large" } });
  });

  it("a gzip-compressed document within the limits loads", async () => {
    const bundled = await loadDocument(withRemoteRef("/bomb.json"));

    expect(bundled.components?.schemas?.bomb).toMatchObject({ type: "object" });
  });
});

describe("remote documents that parse into too many nodes", () => {
  const limits: RemoteDocumentLimits = { ...DEFAULT_REMOTE_DOCUMENT_LIMITS, maxNodes: DENSE_NODES };

  it("a dense remote document stops at the node limit while it is parsed", async () => {
    const error = await loadFailure(withRemoteRef("/dense.json"), { limits });

    expect(error).toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { ref: `${baseURL}/dense.json`, reason: "remote-documents-too-many-nodes", maxNodes: DENSE_NODES },
    });
    expect(error.message).toContain(`parse into more than ${DENSE_NODES} nodes together`);
  });

  it("a dense remote root document stops at the node limit", async () => {
    const error = await loadFailure(new URL(`${baseURL}/dense.yaml`), { limits });

    expect(error).toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { reason: "remote-documents-too-many-nodes" },
    });
  });

  it("remote documents within the node limit load, and one that is kept as text is not counted", async () => {
    const bundled = await loadDocument(withRemoteRef("/dense.json"), {
      limits: { ...limits, maxNodes: DENSE_NODES * 2 },
    });
    const asText = await loadDocument(withRemoteRef("/dense.txt"), { limits });

    expect(bundled.components?.schemas?.Person).toBeDefined();
    expect(asText.components?.schemas?.Person).toBeDefined();
  });
});

describe("credentials in remote URLs", () => {
  it("a $ref URL with user info fails without the credentials in the error", async () => {
    const withCredentials = baseURL.replace("//", "//tok:URL-SECRET@");

    const error = await loadFailure(documentWith({ Person: { $ref: `${withCredentials}/person.json` } }));

    expect(error.code).toBe("SCHEMA_INVALID");
    expect(JSON.stringify({ message: error.message, details: error.details })).not.toContain("URL-SECRET");
  });

  it("a source URL with user info fails without the credentials in the error", async () => {
    const withCredentials = baseURL.replace("//", "//tok:URL-SECRET@");

    const error = await loadFailure(new URL(`${withCredentials}/person.json`));

    expect(error.code).toBe("SCHEMA_LOAD_FAILED");
    expect(JSON.stringify({ message: error.message, details: error.details })).not.toContain("URL-SECRET");
    expect(inspect(error)).not.toContain("URL-SECRET");
  });

  it("a $ref to a whole document with a query is bundled under the name without the query", async () => {
    const bundled = await loadDocument(withRemoteRef("/person.json?token=URL-SECRET"));

    expect(bundled.components?.schemas).toEqual({
      Person: { $ref: "#/components/schemas/person" },
      person: JSON.parse(PERSON),
    });
  });

  it("documents that differ only in the query get one name each, without the query", async () => {
    const document = documentWith({
      A: { $ref: `${baseURL}/versioned?v=1&token=URL-SECRET` },
      B: { $ref: `${baseURL}/versioned?v=2&token=URL-SECRET` },
      C: { $ref: `${baseURL}/person.json?token=URL.SECRET` },
    });

    const bundled = await loadDocument(document);

    expect(bundled.components?.schemas).toEqual({
      A: { $ref: "#/components/schemas/versioned" },
      B: { $ref: "#/components/schemas/versioned-2" },
      C: { $ref: "#/components/schemas/person" },
      versioned: { type: "string", description: "1" },
      "versioned-2": { type: "string", description: "2" },
      person: JSON.parse(PERSON),
    });
  });

  it("a relative $ref of a redirected root loads from the URL the root came from", async () => {
    const bundled = await loadDocument(new URL(`${baseURL}/latest`));

    expect(bundled.components?.schemas).toEqual({
      Pet: { $ref: "#/components/schemas/pet" },
      pet: { type: "object", properties: { v1only: { type: "string" } } },
    });
  });

  it("a relative $ref of a redirected $ref document loads from the URL that document came from", async () => {
    const bundled = await loadDocument(documentWith({ Tag: { $ref: `${baseURL}/moved/tag.json` } }));

    expect(Object.values(bundled.components?.schemas ?? {})).toContainEqual({ type: "string", description: "v1" });
    expect(JSON.stringify(bundled)).not.toContain("integer");
  });

  it("documents whose queries end in the same text after a slash are named after their own paths", async () => {
    const logger = new RecordingLogger();
    const document = documentWith({
      A: { $ref: `${baseURL}/person.json?ref=feature/new-api` },
      B: { $ref: `${baseURL}/other/versioned?ref=feature/new-api` },
    });

    const bundled = await loadDocument(document, { logger });

    expect(bundled.components?.schemas).toEqual({
      A: { $ref: "#/components/schemas/person" },
      B: { $ref: "#/components/schemas/versioned" },
      person: JSON.parse(PERSON),
      versioned: { type: "integer" },
    });
    expect(logger.messages("warn")).toEqual([]);
  });

  it("the bundle's problems name the components by their names without the query", async () => {
    const logger = new RecordingLogger();
    const document = documentWith({
      A: { $ref: `${baseURL}/versioned?token=URL-SECRET` },
      B: { $ref: `${baseURL}/other/versioned?token=URL-SECRET` },
    });

    const bundled = await loadDocument(document, { logger });

    expect(Object.keys(bundled.components?.schemas ?? {})).toEqual(["A", "B", "versioned", "versioned-2"]);
    expect(logger.messages("warn").join("\n")).not.toContain("URL-SECRET");
    expect(logger.messages("warn")).toContainEqual(expect.stringContaining("Renamed versioned to versioned-2"));
  });

  it("a source string that starts like a URL but does not parse fails with SCHEMA_SOURCE_INVALID", async () => {
    // A `/` in the password ends the authority for a URL parser, so only the last `@` tells.
    const error = await loadFailure("http://tok:URL/SECRET@[::1/x.yaml");

    expect(error.code).toBe("SCHEMA_SOURCE_INVALID");
    expect(error.details).toEqual({ reason: "url", received: "string" });
    expect(inspect(error)).not.toContain("SECRET");
  });

  it("a source string with an uppercase scheme loads as a URL", async () => {
    const error = await loadFailure(`${baseURL.replace("http:", "HTTP:")}/person.json`);

    // The fetched schema is no OpenAPI document; read as YAML text, the string would fail with
    // SCHEMA_SOURCE_INVALID instead.
    expect(error.code).toBe("SCHEMA_VERSION_UNSUPPORTED");
  });
});
