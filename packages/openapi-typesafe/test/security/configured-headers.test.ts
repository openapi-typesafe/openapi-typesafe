import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { createConfig } from "@redocly/openapi-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createRedoclySchemaLoader } from "../../src/adapters/redocly-loader/redocly-schema-loader.js";
import { DEFAULT_REMOTE_DOCUMENT_LIMITS } from "../../src/api/default-ports.js";
import type { RefAccess } from "../../src/application/ports/schema-loader.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";

/**
 * Headers from `resolve.http.headers` go only to the URLs their pattern names (threat model T4a):
 * not on through a redirect to another origin, not to a URL that matches only through its query,
 * and not over plain HTTP unless the pattern says `http://`.
 */

const SECRET = "SECRET-KEY";
const PERSON = JSON.stringify({ type: "object", properties: { name: { type: "string" } } });

function documentWithRef(ref: string): string {
  return JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Headers", version: "1.0" },
    paths: {},
    components: { schemas: { Person: { $ref: ref } } },
  });
}

let server: Server;
/** `127.0.0.1` and `localhost` on the same port: one server, two origins. */
let trustedURL: string;
let otherURL: string;
let received: { host: string; url: string; key: string | undefined }[] = [];

function answer(request: IncomingMessage, response: ServerResponse): void {
  const key = request.headers["x-api-key"];
  received.push({
    host: request.headers.host ?? "",
    url: request.url ?? "",
    key: typeof key === "string" ? key : undefined,
  });
  // A Map, so a request path such as `/constructor` cannot reach an object prototype method.
  const routes = new Map<string, () => void>(
    Object.entries({
      "/person.json": () => response.writeHead(200, { "content-type": "application/json" }).end(PERSON),
      "/to-other.json": () => response.writeHead(302, { location: `${otherURL}/person.json` }).end(),
      "/to-same.json": () => response.writeHead(302, { location: "/person.json" }).end(),
    }),
  );
  const path = (request.url ?? "").split("?")[0] ?? "";
  const route = routes.get(path);
  // The explicit check is the guard CodeQL expects before calling a handler chosen by a request.
  if (typeof route !== "function") {
    response.writeHead(404).end("Not Found");
    return;
  }
  route();
}

beforeAll(async () => {
  server = createServer(answer);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  trustedURL = `http://127.0.0.1:${port}`;
  otherURL = `http://localhost:${port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  received = [];
});

async function load(ref: string, matches: string, refAccess: RefAccess = {}) {
  const redoc = await createConfig({
    resolve: { http: { headers: [{ matches, name: "X-Api-Key", value: SECRET }] } },
  });
  const loader = createRedoclySchemaLoader({
    redoc,
    logger: new RecordingLogger(),
    now: () => 0,
    remoteRefTimeoutMs: 2_000,
    remoteDocumentLimits: DEFAULT_REMOTE_DOCUMENT_LIMITS,
  });
  const source = documentWithRef(ref);
  return loader.load({ source, cwd: pathToFileURL(`${process.cwd()}/`), shouldLint: false, refAccess });
}

const trustedPattern = () => `http://127.0.0.1:${new URL(trustedURL).port}/**`;

describe("configured headers", () => {
  it("a header goes to a URL its pattern matches", async () => {
    await load(`${trustedURL}/person.json`, trustedPattern());

    expect(received).toEqual([{ host: new URL(trustedURL).host, url: "/person.json", key: SECRET }]);
  });

  it("a header follows a redirect to the same origin", async () => {
    await load(`${trustedURL}/to-same.json`, trustedPattern());

    expect(received.map((request) => request.key)).toEqual([SECRET, SECRET]);
  });

  it.each([
    ["without host limits", {}],
    ["with host limits", { remoteHosts: ["127.0.0.1", "localhost"] }],
  ])("a header is not sent on through a redirect to another origin, %s", async (_, access) => {
    await load(`${trustedURL}/to-other.json`, trustedPattern(), access);

    expect(received).toEqual([
      { host: new URL(trustedURL).host, url: "/to-other.json", key: SECRET },
      { host: new URL(otherURL).host, url: "/person.json", key: undefined },
    ]);
  });

  it("a `*` in the pattern does not match across the query of another host's URL", async () => {
    const port = new URL(trustedURL).port;
    const ref = `${otherURL}?.trusted.example:${port}/person.json`;

    // The URL names `/` on the other host, which does not exist; only the request matters.
    await load(ref, `http://*.trusted.example:${port}/**`).catch(() => undefined);

    expect(received).toHaveLength(1);
    expect(received[0]?.key).toBeUndefined();
  });

  // Plain HTTP to another machine needs `http://` in the pattern; ref-access.test.ts covers that
  // case, since this server can only listen on this machine.
  it("a pattern without a protocol sends its header over plain HTTP to this machine", async () => {
    await load(`${trustedURL}/person.json`, `127.0.0.1:${new URL(trustedURL).port}/**`);

    expect(received).toHaveLength(1);
    expect(received[0]?.key).toBe(SECRET);
  });
});
