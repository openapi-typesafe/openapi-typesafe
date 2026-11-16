import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createConfig } from "@redocly/openapi-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedoclySchemaLoader } from "../../src/adapters/redocly-loader/redocly-schema-loader.js";
import { DEFAULT_REMOTE_DOCUMENT_LIMITS } from "../../src/api/default-ports.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { documentWith } from "./defensive-helpers.js";

/**
 * A remote root is named as Redocly names a `$ref` URL (`redoclyUrlName`): the text the user
 * wrote when it starts with `http://` or `https://`, so the lint ignore file that
 * `redocly lint --generate-ignore-file` writes for the root matches it.
 */

const LOAD_TIMEOUT_MS = 10_000;
const REDIRECT = 302;
/** A root whose schema breaks the `struct` rule, so only a matching ignore entry lets it load. */
const ROOT = JSON.stringify(documentWith({ A: { type: "string", minLength: "two" } }));
const IGNORED_PROBLEM = { struct: new Set(["#/components/schemas/A/minLength"]) };
const ROOT_ROUTES = new Set(["/root.json", "/my%20root.json"]);

let server: Server;
let port: number;

function answer(request: IncomingMessage, response: ServerResponse): void {
  const route = (request.url ?? "").split("?")[0] ?? "";
  if (ROOT_ROUTES.has(route)) {
    response.writeHead(200, { "content-type": "application/json" }).end(ROOT);
    return;
  }
  if (route === "/my%20moved.json") {
    // To another host name of the same server, which `remoteHosts` does not list.
    response.writeHead(REDIRECT, { location: `http://localhost:${port}/root.json` }).end();
    return;
  }
  response.writeHead(404).end("Not Found");
}

beforeAll(async () => {
  server = createServer(answer);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

interface RootLoad {
  readonly written?: string;
  readonly ignored?: string;
  readonly remoteHosts?: readonly string[];
}

/** Load the root at `url`, given as a `URL` and the text it was written as, as the CLI gives it. */
async function loadRoot(url: string, load: RootLoad = {}) {
  const redoc = await createConfig({ rules: { struct: "error" } });
  if (load.ignored !== undefined) {
    redoc.styleguide.ignore[load.ignored] = IGNORED_PROBLEM;
  }
  const loader = createRedoclySchemaLoader({
    redoc,
    logger: new RecordingLogger(),
    now: () => 0,
    remoteRefTimeoutMs: LOAD_TIMEOUT_MS,
    remoteDocumentLimits: DEFAULT_REMOTE_DOCUMENT_LIMITS,
  });
  const loaded = await loader.load({
    source: new URL(url),
    writtenSource: load.written,
    cwd: pathToFileURL(`${path.resolve("/work")}${path.sep}`),
    shouldLint: true,
    refAccess: load.remoteHosts === undefined ? {} : { remoteHosts: load.remoteHosts },
  });
  return loaded.document;
}

const spellings: readonly (readonly [string, (port: number) => string])[] = [
  ["a space in the path", (at) => `http://127.0.0.1:${at}/my root.json`],
  ["a dot-dot segment", (at) => `http://127.0.0.1:${at}/x/../root.json`],
  ["a host in capitals", (at) => `http://LOCALHOST:${at}/root.json`],
  ["a space in the query", (at) => `http://127.0.0.1:${at}/root.json?key=se cret`],
];

describe("remote root names", () => {
  it.each(spellings)("a lint ignore entry for a URL root with %s keyed as written applies", async (_, rootAt) => {
    const written = rootAt(port);

    const bundled = await loadRoot(written, { written, ignored: written });

    expect(bundled.components?.schemas?.A).toEqual({ type: "string", minLength: "two" });
  });

  it.each(spellings)(
    "a lint ignore entry for a URL root with %s keyed by its parsed URL does not apply",
    async (_, rootAt) => {
      const written = rootAt(port);

      const load = loadRoot(written, { written, ignored: new URL(written).href });

      await expect(load).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    },
  );

  it("a lint ignore entry for a URL root written in capitals is keyed by its parsed URL", async () => {
    const written = `HTTP://127.0.0.1:${port}/x/../root.json`;

    const bundled = await loadRoot(written, { written, ignored: new URL(written).href });

    expect(bundled.components?.schemas?.A).toBeDefined();
  });

  it("a lint ignore entry for a URL root given without its text is keyed by its parsed URL", async () => {
    const url = `http://127.0.0.1:${port}/my root.json`;

    const bundled = await loadRoot(url, { ignored: new URL(url).href });

    expect(bundled.components?.schemas?.A).toBeDefined();
  });

  it("a URL root named as written redirects to a host the remote hosts do not list", async () => {
    const written = `http://127.0.0.1:${port}/my moved.json`;
    const ignored = written;

    const bundled = await loadRoot(written, { written, ignored, remoteHosts: ["example.com"] });

    expect(bundled.components?.schemas?.A).toBeDefined();
  });
});
