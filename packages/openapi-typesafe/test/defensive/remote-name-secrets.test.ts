import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspect } from "node:util";
import { createConfig } from "@redocly/openapi-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedoclySchemaLoader } from "../../src/adapters/redocly-loader/redocly-schema-loader.js";
import type { RemoteDocumentLimits } from "../../src/adapters/redocly-loader/remote-fetch.js";
import { DEFAULT_REMOTE_DOCUMENT_LIMITS } from "../../src/api/default-ports.js";
import type { SchemaLoadRequest } from "../../src/application/ports/schema-loader.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { documentWith } from "./defensive-helpers.js";

/**
 * A document's name as written may hold a space or a quote in its path and in its query
 * (`http://host/my 'pet.yaml?key=se cret'…`). Every failure of a load that names such a document,
 * in its message, its details, its cause chain or the lines it logs, hides the query.
 */

const SECRET = "URL-SECRET";
const QUERY = `?key=se cret'${SECRET}`;
const LOAD_TIMEOUT_MS = 10_000;
const SHORT_TIMEOUT_MS = 200;
const REDIRECT = 302;

/** A YAML alias bomb: nine levels of ten aliases each, a billion nodes once expanded. */
function aliasBombYaml(): string {
  const levels = ["a: &a [lol, lol, lol, lol, lol, lol, lol, lol, lol, lol]"];
  for (const [index, name] of ["b", "c", "d", "e", "f", "g", "h", "i"].entries()) {
    const previous = String.fromCharCode("a".charCodeAt(0) + index);
    levels.push(`${name}: &${name} [${Array(10).fill(`*${previous}`).join(", ")}]`);
  }
  return levels.join("\n");
}

const ROOT = JSON.stringify(documentWith({ A: { type: "string" } }));
const HEADER_NAMED_CONSTRUCTOR = JSON.stringify({
  get: {
    responses: {
      200: { description: "OK", headers: { constructor: { name: "x", schema: { type: "string" } } } },
    },
  },
});

/** The body of each document by its decoded path; `undefined` never answers. */
const BODIES: ReadonlyMap<string, string | undefined> = new Map([
  ["/my 'root.json", ROOT],
  ["/my 'ok.json", JSON.stringify({ type: "string" })],
  ["/my 'broken.yaml", "a: [1 2"],
  ["/my 'bomb.yaml", aliasBombYaml()],
  ["/my 'file-ref.json", JSON.stringify({ $ref: "file:///specs/pet.yaml" })],
  ["/my 'malformed.json", JSON.stringify({ properties: { a: { $ref: "#/properties/50%" } } })],
  ["/my 'invalid.json", JSON.stringify({ type: "string", minLength: "two" })],
  ["/my 'path-item.json", HEADER_NAMED_CONSTRUCTOR],
  ["/my 'slow.json", undefined],
]);

function answer(request: IncomingMessage, response: ServerResponse): void {
  const url = request.url ?? "";
  const route = decodeURIComponent(url.split("?")[0] ?? "");
  if (route === "/my 'loop.json") {
    response.writeHead(REDIRECT, { location: url }).end();
    return;
  }
  if (!BODIES.has(route)) {
    response.writeHead(404).end("Not Found");
    return;
  }
  const body = BODIES.get(route);
  if (body !== undefined) {
    response.writeHead(200, { "content-type": "application/json" }).end(body);
  }
}

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer(answer);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

/** The URL of a served document, as written, with a space and a quote in its path and query. */
const urlOf = (name: string) => `http://127.0.0.1:${port}/my '${name}${QUERY}`;

interface Load {
  /** A document object, a `URL` or text, as the Node API takes it. */
  readonly source: unknown;
  readonly writtenSource?: string;
  readonly limits?: Partial<RemoteDocumentLimits>;
  readonly remoteHosts?: readonly string[];
  readonly timeoutMs?: number;
}

/** Everything a failed load shows: the error with its whole cause chain, and the logged lines. */
async function shownFailure(load: Load): Promise<string> {
  const logger = new RecordingLogger();
  const loader = createRedoclySchemaLoader({
    redoc: await createConfig({ rules: { struct: "error" } }),
    logger,
    now: () => 0,
    remoteRefTimeoutMs: load.timeoutMs ?? LOAD_TIMEOUT_MS,
    remoteDocumentLimits: { ...DEFAULT_REMOTE_DOCUMENT_LIMITS, ...load.limits },
  });
  const request = {
    source: load.source as SchemaLoadRequest["source"],
    writtenSource: load.writtenSource,
    cwd: pathToFileURL(`${path.resolve("/work")}${path.sep}`),
    shouldLint: true,
    refAccess: load.remoteHosts === undefined ? {} : { remoteHosts: load.remoteHosts },
  };
  const error = await loader.load(request).then(
    () => new Error("The load should have failed"),
    (failure: unknown) => failure,
  );
  const lines = logger.lines.map((line) => line.message);
  return [inspect(error, { depth: Number.POSITIVE_INFINITY }), ...lines].join("\n");
}

/** A root that refers to the named document from a schema. */
const schemaRef = (name: string) => documentWith({ A: { $ref: urlOf(name) } });

/** A failure: what it is, how the load is made, and the code and words it shows. */
type Failure = readonly [string, () => Load, string, string];

const refFailures: readonly Failure[] = [
  ["a YAML parse error", () => ({ source: schemaRef("broken.yaml") }), "SCHEMA_INVALID", "flow collection"],
  ["a missing document", () => ({ source: schemaRef("missing.json") }), "SCHEMA_INVALID", "404"],
  ["a redirect loop", () => ({ source: schemaRef("loop.json") }), "SCHEMA_INVALID", "redirects"],
  [
    "a time limit",
    () => ({ source: schemaRef("slow.json"), timeoutMs: SHORT_TIMEOUT_MS }),
    "SCHEMA_INVALID",
    "Timed out",
  ],
  ["a YAML alias bomb", () => ({ source: schemaRef("bomb.yaml") }), "SCHEMA_INVALID", "aliases"],
  ["a local $ref in it", () => ({ source: schemaRef("file-ref.json") }), "SCHEMA_REF_FORBIDDEN", "remote document"],
  ["a malformed $ref in it", () => ({ source: schemaRef("malformed.json") }), "SCHEMA_REF_INVALID", "50%"],
  [
    "a malformed pointer in its $ref",
    () => ({ source: documentWith({ A: { $ref: `${urlOf("ok.json")}#/50%` } }) }),
    "SCHEMA_REF_INVALID",
    "50%",
  ],
  ["a lint problem in it", () => ({ source: schemaRef("invalid.json") }), "SCHEMA_INVALID", "minLength"],
  [
    "a key the loader cannot walk",
    () => ({ source: { ...documentWith({}), paths: { "/a": { $ref: urlOf("path-item.json") } } } }),
    "SCHEMA_KEY_UNSUPPORTED",
    "constructor",
  ],
  [
    "a host not allowed",
    () => ({ source: schemaRef("ok.json"), remoteHosts: ["example.com"] }),
    "SCHEMA_REF_FORBIDDEN",
    "allowed",
  ],
  [
    "too many documents",
    () => ({ source: schemaRef("ok.json"), limits: { maxDocuments: 0 } }),
    "SCHEMA_REF_FORBIDDEN",
    "more than 0 remote documents",
  ],
  [
    "too large a document",
    () => ({ source: schemaRef("ok.json"), limits: { maxDocumentBytes: 1 } }),
    "SCHEMA_REF_FORBIDDEN",
    "larger than 1 bytes",
  ],
  [
    "too many nodes",
    () => ({ source: schemaRef("ok.json"), limits: { maxNodes: 1 } }),
    "SCHEMA_REF_FORBIDDEN",
    "more than 1 nodes",
  ],
];

/** A remote root, given as a `URL` with the text it was written as, as the CLI gives it. */
const rootLoad = (name: string, load: Partial<Load> = {}): Load => ({
  source: new URL(urlOf(name)),
  writtenSource: urlOf(name),
  ...load,
});

const rootFailures: readonly Failure[] = [
  ["a YAML parse error", () => rootLoad("broken.yaml"), "SCHEMA_PARSE_FAILED", "flow collection"],
  ["a missing document", () => rootLoad("missing.json"), "SCHEMA_LOAD_FAILED", "404"],
  ["a redirect loop", () => rootLoad("loop.json"), "SCHEMA_LOAD_FAILED", "redirects"],
  ["a time limit", () => rootLoad("slow.json", { timeoutMs: SHORT_TIMEOUT_MS }), "SCHEMA_LOAD_FAILED", "Timed out"],
  ["a YAML alias bomb", () => rootLoad("bomb.yaml"), "SCHEMA_PARSE_FAILED", "aliases"],
  [
    "too large a document",
    () => rootLoad("root.json", { limits: { maxDocumentBytes: 1 } }),
    "SCHEMA_REF_FORBIDDEN",
    "larger than 1 bytes",
  ],
];

describe("secrets of document names with a space and a quote", () => {
  it.each(refFailures)("a $ref document that fails with %s hides its query", async (_, load, code, words) => {
    const shown = await shownFailure(load());

    expect(shown).toContain(code);
    expect(shown).toContain(words);
    expect(shown).not.toContain(SECRET);
  });

  it.each(rootFailures)("a URL root that fails with %s hides its query", async (_, load, code, words) => {
    const shown = await shownFailure(load());

    expect(shown).toContain(code);
    expect(shown).toContain(words);
    expect(shown).not.toContain(SECRET);
  });
});
