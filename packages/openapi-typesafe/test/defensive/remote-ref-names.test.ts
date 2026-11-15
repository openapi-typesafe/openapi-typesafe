import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createConfig } from "@redocly/openapi-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedoclySchemaLoader } from "../../src/adapters/redocly-loader/redocly-schema-loader.js";
import { DEFAULT_REMOTE_DOCUMENT_LIMITS } from "../../src/api/default-ports.js";
import type { OpenAPITypesafeError } from "../../src/domain/errors.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { documentWith } from "./defensive-helpers.js";

/**
 * A remote `$ref` document is named as Redocly names it: a `$ref` that starts with `http://` or
 * `https://` keeps its text, so the lint ignore file `redocly lint` writes matches the document.
 */

const LOAD_TIMEOUT_MS = 10_000;
/** A schema that breaks the `struct` rule, so only a matching ignore entry lets it load. */
const LIMITED = JSON.stringify({ type: "string", minLength: "two" });
const IGNORED_PROBLEM = { struct: new Set(["#/minLength"]) };
const ROUTES = new Set(["/limited.json", "/my%20limited.json"]);
/** The query of the tests of secrets in URLs; the route is the path. */
const routeOf = (url: string) => url.split("?")[0] ?? "";

function answer(request: IncomingMessage, response: ServerResponse): void {
  if (ROUTES.has(routeOf(request.url ?? ""))) {
    response.writeHead(200, { "content-type": "application/json" }).end(LIMITED);
    return;
  }
  response.writeHead(404).end("Not Found");
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

interface LoadOptions {
  readonly ignored?: readonly string[];
  readonly remoteHosts?: readonly string[];
}

/** Load a document with one schema for each `$ref`, with the given ignore file entries. */
async function loadWith(refs: readonly string[], options: LoadOptions = {}) {
  const redoc = await createConfig({ rules: { struct: "error" } });
  for (const ref of options.ignored ?? []) {
    redoc.styleguide.ignore[ref] = IGNORED_PROBLEM;
  }
  const loader = createRedoclySchemaLoader({
    redoc,
    logger: new RecordingLogger(),
    now: () => 0,
    remoteRefTimeoutMs: LOAD_TIMEOUT_MS,
    remoteDocumentLimits: DEFAULT_REMOTE_DOCUMENT_LIMITS,
  });
  const schemas = Object.fromEntries(refs.map((ref, index) => [`Limited${index}`, { $ref: ref }]));
  const loaded = await loader.load({
    source: documentWith(schemas) as never,
    cwd: pathToFileURL(`${path.resolve("/work")}${path.sep}`),
    shouldLint: true,
    refAccess: options.remoteHosts === undefined ? {} : { remoteHosts: options.remoteHosts },
  });
  return loaded.document;
}

const spellings: readonly (readonly [string, (port: number) => string])[] = [
  ["a short IPv4 host", (at) => `http://127.1:${at}/limited.json`],
  ["a dot-dot segment", (at) => `http://127.0.0.1:${at}/x/../limited.json`],
  ["a space in the path", (at) => `http://127.0.0.1:${at}/my limited.json`],
  ["a port with a leading zero", (at) => `http://127.0.0.1:0${at}/limited.json`],
];

describe("remote $ref names", () => {
  it.each(spellings)("a lint ignore entry for a $ref URL with %s keyed as written applies", async (_, refAt) => {
    const ref = refAt(port);

    const bundled = await loadWith([ref], { ignored: [ref] });

    expect(Object.values(bundled.components?.schemas ?? {})).toContainEqual(JSON.parse(LIMITED));
  });

  it.each(spellings)(
    "a lint ignore entry for a $ref URL with %s keyed by its parsed URL does not apply",
    async (_, refAt) => {
      const ref = refAt(port);

      const failure = loadWith([ref], { ignored: [new URL(ref).href] });

      await expect(failure).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    },
  );

  it("a lint ignore entry for a $ref URL in capitals is keyed by its parsed URL", async () => {
    const ref = `HTTP://127.0.0.1:${port}/limited.json`;

    const bundled = await loadWith([ref], { ignored: [new URL(ref).href] });

    expect(Object.values(bundled.components?.schemas ?? {})).toContainEqual(JSON.parse(LIMITED));
  });

  it("one document written two ways is two documents, each with its own ignore entry", async () => {
    const refs = [`http://127.0.0.1:${port}/limited.json`, `http://127.1:${port}/limited.json`];

    const error = await failureOf(loadWith(refs, { ignored: [refs[0] ?? ""] }));

    expect(error).toMatchObject({ code: "SCHEMA_INVALID" });
    expect(error.message).toContain(`127.1:${port}`);
  });

  it("one document written two ways is bundled as one component", async () => {
    const refs = [`http://127.0.0.1:${port}/limited.json`, `http://127.1:${port}/limited.json`];

    const bundled = await loadWith(refs, { ignored: refs });

    expect(bundled.components?.schemas).toEqual({
      Limited0: { $ref: "#/components/schemas/limited" },
      Limited1: { $ref: "#/components/schemas/limited" },
      limited: JSON.parse(LIMITED),
    });
  });
});

async function failureOf(load: Promise<unknown>): Promise<OpenAPITypesafeError> {
  try {
    await load;
  } catch (error) {
    return error as OpenAPITypesafeError;
  }
  throw new Error("The load should have failed");
}

/** Everything a failure shows: its message and its details. */
const shownText = (error: OpenAPITypesafeError) => JSON.stringify({ message: error.message, details: error.details });

describe("remote $ref names with a space", () => {
  it("a missing document's error hides the query after the space", async () => {
    const ref = `http://127.0.0.1:${port}/my missing.json?token=URL-SECRET`;

    const error = await failureOf(loadWith([ref]));

    expect(error.message).toContain(`/my missing.json?***: 404`);
    expect(shownText(error)).not.toContain("URL-SECRET");
  });

  it("a problem in a loaded document names it with the query hidden", async () => {
    const ref = `http://127.0.0.1:${port}/my limited.json?token=URL-SECRET`;

    const error = await failureOf(loadWith([ref]));

    expect(error.message).toContain(`in http://127.0.0.1:${port}/my limited.json?***`);
    expect(shownText(error)).not.toContain("URL-SECRET");
  });

  it("a refused document's error hides the query after the space", async () => {
    const ref = `http://127.0.0.1:${port}/my limited.json?token=URL-SECRET`;

    const error = await failureOf(loadWith([ref], { remoteHosts: ["example.com"] }));

    expect(error).toMatchObject({ code: "SCHEMA_REF_FORBIDDEN" });
    expect(shownText(error)).not.toContain("URL-SECRET");
  });
});
