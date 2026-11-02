import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedoclySchemaLoader } from "../../src/adapters/redocly-loader/redocly-schema-loader.js";
import { defaultRedoclyConfig } from "../../src/api/default-ports.js";
import type { OpenAPITypesafeError } from "../../src/domain/errors.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { documentWith } from "./defensive-helpers.js";

/** Short enough for a fast test, long enough for a local answer on a busy CI machine. */
const TEST_TIMEOUT_MS = 500;

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

/** The routes of the local server: a schema, a missing file, a redirect loop, no answer and a slow body. */
function answer(request: IncomingMessage, response: ServerResponse): void {
  const routes: Record<string, () => void> = {
    "/person.json": () => response.writeHead(200, { "content-type": "application/json" }).end(PERSON),
    "/unsupported-key.json": () => response.writeHead(200, { "content-type": "application/json" }).end(UNSUPPORTED_KEY),
    "/loop.json": () => response.writeHead(302, { location: "/loop.json" }).end(),
    "/hang.json": () => undefined,
    "/drip.json": () => drip(response),
  };
  (routes[request.url ?? ""] ?? (() => response.writeHead(404).end("Not Found")))();
}

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

async function loadDocument(source: unknown) {
  const loader = createRedoclySchemaLoader({
    redoc: await defaultRedoclyConfig(),
    logger: new RecordingLogger(),
    now: () => 0,
    remoteRefTimeoutMs: TEST_TIMEOUT_MS,
  });
  return loader.load({ source: source as never, cwd: new URL("file:///work/"), shouldLint: true, refAccess: {} });
}

async function loadFailure(source: unknown): Promise<OpenAPITypesafeError> {
  try {
    await loadDocument(source);
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
    ["is missing", "/missing.json"],
    ["redirects to itself", "/loop.json"],
    ["never answers", "/hang.json"],
    ["sends its body one byte at a time forever", "/drip.json"],
  ])("a remote $ref that %s fails with SCHEMA_INVALID within the time limit", async (_name, path) => {
    const startedAt = performance.now();

    const error = await loadFailure(withRemoteRef(path));

    expect(error.code).toBe("SCHEMA_INVALID");
    expect(error.message).toMatch(/^Can't resolve \$ref: .* at #\/components\/schemas\/Person$/);
    expect(performance.now() - startedAt).toBeLessThan(TEST_TIMEOUT_MS * 10);
  });

  it("a remote source that never answers fails with SCHEMA_LOAD_FAILED and names the limit", async () => {
    const error = await loadFailure(new URL(`${baseURL}/hang.json`));

    expect(error).toMatchObject({ code: "SCHEMA_LOAD_FAILED" });
    expect(error.message).toBe(`Timed out after ${TEST_TIMEOUT_MS} ms loading ${baseURL}/hang.json`);
  });

  it("a remote source that sends its body one byte at a time fails within the time limit", async () => {
    const error = await loadFailure(new URL(`${baseURL}/drip.json`));

    expect(error).toMatchObject({ code: "SCHEMA_LOAD_FAILED" });
    expect(error.message).toBe(`Timed out after ${TEST_TIMEOUT_MS} ms loading ${baseURL}/drip.json`);
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
