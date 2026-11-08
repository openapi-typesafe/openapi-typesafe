import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createConfig } from "@redocly/openapi-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedoclySchemaLoader } from "../../src/adapters/redocly-loader/redocly-schema-loader.js";
import { DEFAULT_REMOTE_DOCUMENT_LIMITS, defaultRedoclyConfig } from "../../src/api/default-ports.js";
import type { RefAccess } from "../../src/application/ports/schema-loader.js";
import openapiTS, { astToString, type OpenAPITypesafeError } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";

/** The `$ref` limits of threat model R1 (local files) and R2 (remote hosts), ADR-017. */

const PERSON = JSON.stringify({ type: "object", properties: { name: { type: "string" } } });
const INFO = { title: "Refs", version: "1.0" };

function documentWithRef(ref: string): string {
  return JSON.stringify({
    openapi: "3.1.0",
    info: INFO,
    paths: {},
    components: { schemas: { Person: { $ref: ref } } },
  });
}

let workDir: string;
let server: Server;
let baseURL: string;
/** The same server under another host name, so that it counts as another host. */
let otherHostURL: string;

function answer(request: IncomingMessage, response: ServerResponse): void {
  // A Map, so a request path such as `/constructor` cannot reach an object prototype method.
  const routes = new Map<string, () => void>(
    Object.entries({
      "/person.json": () => response.writeHead(200, { "content-type": "application/json" }).end(PERSON),
      "/root.json": () =>
        response.writeHead(200, { "content-type": "application/json" }).end(documentWithRef("./person.json")),
      "/to-other-host.json": () => response.writeHead(302, { location: `${otherHostURL}/person.json` }).end(),
      "/to-same-host.json": () => response.writeHead(301, { location: "/person.json" }).end(),
      "/loop.json": () => response.writeHead(302, { location: "/loop.json" }).end(),
      "/drive-letter.json": () =>
        response.writeHead(200, { "content-type": "application/json" }).end(documentWithRef("C:/secrets/person.json")),
      "/file-url.json": () =>
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(documentWithRef(pathToFileURL(path.join(workDir, "secrets", "person.json")).href)),
    }),
  );
  (routes.get(request.url ?? "") ?? (() => response.writeHead(404).end("Not Found")))();
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "ref-access-"));
  await mkdir(path.join(workDir, "api", "shared"), { recursive: true });
  await mkdir(path.join(workDir, "secrets"));
  await writeFile(path.join(workDir, "api", "shared", "person.json"), PERSON);
  await writeFile(path.join(workDir, "secrets", "person.json"), PERSON);
  await symlink(path.join(workDir, "secrets"), path.join(workDir, "api", "link-out"));
  server = createServer(answer);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseURL = `http://127.0.0.1:${port}`;
  otherHostURL = `http://localhost:${port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(workDir, { recursive: true, force: true });
});

async function writeRoot(relativePath: string, ref: string): Promise<URL> {
  const file = path.join(workDir, relativePath);
  await writeFile(file, documentWithRef(ref));
  return pathToFileURL(file);
}

const localRoot = () => pathToFileURL(path.join(workDir, "api"));

async function load(source: URL, refAccess: RefAccess, shouldLint = true) {
  const loader = createRedoclySchemaLoader({
    redoc: await defaultRedoclyConfig(),
    logger: new RecordingLogger(),
    now: () => 0,
    remoteRefTimeoutMs: 2_000,
    remoteDocumentLimits: DEFAULT_REMOTE_DOCUMENT_LIMITS,
  });
  return loader.load({ source, cwd: pathToFileURL(`${workDir}/`), shouldLint, refAccess });
}

async function loadFailure(source: URL, refAccess: RefAccess): Promise<OpenAPITypesafeError> {
  try {
    await load(source, refAccess);
  } catch (error) {
    return error as OpenAPITypesafeError;
  }
  throw new Error("The load should have failed");
}

describe("local $ref root (R1)", () => {
  it("a $ref inside the root is loaded", async () => {
    const root = await writeRoot("api/inside.json", "./shared/person.json");

    const bundled = await load(root, { localRoot: localRoot() });

    expect(bundled.components?.schemas?.person).toEqual(JSON.parse(PERSON));
  });

  it("a $ref outside the root fails with SCHEMA_REF_FORBIDDEN", async () => {
    const root = await writeRoot("api/outside.json", "../secrets/person.json");

    const error = await loadFailure(root, { localRoot: localRoot() });

    expect(error).toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { ref: path.join(workDir, "secrets", "person.json"), reason: "outside-local-root" },
    });
    expect(error.message).toMatch(/^Refused to load .*person\.json: it is outside the local \$ref root /);
  });

  it("a link inside the root that points outside it is refused", async () => {
    const root = await writeRoot("api/through-link.json", "./link-out/person.json");

    const error = await loadFailure(root, { localRoot: localRoot() });

    expect(error.code).toBe("SCHEMA_REF_FORBIDDEN");
  });

  it.each([
    ["an absolute path", () => path.join(workDir, "secrets", "person.json")],
    ["a `..` after a directory inside the root", () => "shared/../../secrets/person.json"],
  ])("%s that leads outside the root is refused", async (_, ref) => {
    const root = await writeRoot("api/escape.json", ref());

    const error = await loadFailure(root, { localRoot: localRoot() });

    expect(error.code).toBe("SCHEMA_REF_FORBIDDEN");
  });

  // Redocly reads both as plain relative file names, so they name missing files inside the root
  // and never reach `secrets/`.
  it.each([
    ["a file: URL", () => pathToFileURL(path.join(workDir, "secrets", "person.json")).href],
    ["a percent-encoded `..`", () => "%2e%2e/secrets/person.json"],
  ])("%s is read as a file name inside the root", async (_, ref) => {
    const root = await writeRoot("api/literal.json", ref());

    const error = await loadFailure(root, { localRoot: localRoot() });

    expect(error.code).toBe("SCHEMA_INVALID");
    expect(error.message).toContain(`${path.sep}api${path.sep}`);
    expect(error.message).toContain("ENOENT");
  });

  it("a missing file inside a root reached through a link is not found, not refused", async () => {
    const linkedRoot = path.join(workDir, "api-link");
    await symlink(path.join(workDir, "api"), linkedRoot);
    const root = await writeRoot("api-link/missing-inside.json", "./nowhere.json");

    const error = await loadFailure(root, { localRoot: pathToFileURL(linkedRoot) });

    expect(error.code).toBe("SCHEMA_INVALID");
    expect(error.message).toContain("ENOENT");
  });

  it("the root document itself may be outside the root", async () => {
    const root = await writeRoot("outer-root.json", "./api/shared/person.json");

    const bundled = await load(root, { localRoot: localRoot() });

    expect(bundled.components?.schemas?.person).toEqual(JSON.parse(PERSON));
  });

  it("a missing file outside the root is refused before it is looked for", async () => {
    const root = await writeRoot("api/missing.json", "../nowhere/person.json");

    const error = await loadFailure(root, { localRoot: localRoot() });

    expect(error.code).toBe("SCHEMA_REF_FORBIDDEN");
  });

  it("the refusal is reported without the lint too", async () => {
    const root = await writeRoot("api/no-lint.json", "../secrets/person.json");

    await expect(load(root, { localRoot: localRoot() }, false)).rejects.toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
    });
  });

  it("without a root, a $ref outside the directory is loaded, as in openapi-typescript", async () => {
    const root = await writeRoot("api/unlimited.json", "../secrets/person.json");

    const bundled = await load(root, {});

    expect(bundled.components?.schemas?.person).toEqual(JSON.parse(PERSON));
  });
});

describe("remote $ref hosts (R2)", () => {
  it("a $ref to a listed host is loaded; the port may be left out", async () => {
    const root = await writeRoot("api/remote.json", `${baseURL}/person.json`);

    const bundled = await load(root, { remoteHosts: ["127.0.0.1"] });

    expect(bundled.components?.schemas?.person).toEqual(JSON.parse(PERSON));
  });

  it("a $ref to a host that is not listed fails with SCHEMA_REF_FORBIDDEN", async () => {
    const root = await writeRoot("api/remote-other.json", `${otherHostURL}/person.json`);

    const error = await loadFailure(root, { remoteHosts: ["127.0.0.1"] });

    expect(error).toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { reason: "host-not-allowed", allowedHosts: ["127.0.0.1"] },
    });
  });

  it.each([
    ["a listed host as user info", () => otherHostURL.replace("//", "//127.0.0.1@")],
    ["a listed host after `#@`", () => `${otherHostURL}#@127.0.0.1`],
    ["a listed host after `\\@`", () => `${otherHostURL}\\@127.0.0.1`],
  ])("%s does not make another host allowed", async (_, prefix) => {
    const root = await writeRoot("api/remote-trick.json", `${prefix()}/person.json`);

    const error = await loadFailure(root, { remoteHosts: ["127.0.0.1"] });

    expect(error.code).toBe("SCHEMA_REF_FORBIDDEN");
  });

  it("an empty list refuses every remote $ref and says so", async () => {
    const root = await writeRoot("api/remote-none.json", `${baseURL}/person.json`);

    const error = await loadFailure(root, { remoteHosts: [] });

    expect(error.message).toContain("is not in the allowed remote $ref hosts (none)");
  });

  it("a redirect to a host that is not listed is refused", async () => {
    const root = await writeRoot("api/redirect-other.json", `${baseURL}/to-other-host.json`);

    const error = await loadFailure(root, { remoteHosts: ["127.0.0.1"] });

    expect(error).toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { ref: `${otherHostURL}/person.json` },
    });
  });

  it("a redirect to the same host is followed", async () => {
    const root = await writeRoot("api/redirect-same.json", `${baseURL}/to-same-host.json`);

    const bundled = await load(root, { remoteHosts: ["127.0.0.1"] });

    expect(Object.values(bundled.components?.schemas ?? {})).toContainEqual(JSON.parse(PERSON));
  });

  it("a redirect loop stops with SCHEMA_INVALID", async () => {
    const root = await writeRoot("api/redirect-loop.json", `${baseURL}/loop.json`);

    const error = await loadFailure(root, { remoteHosts: ["127.0.0.1"] });

    expect(error.code).toBe("SCHEMA_INVALID");
    expect(error.message).toContain("More than 20 redirects");
  });

  it("a remote root document is loaded from a host that is not listed; its $refs are limited", async () => {
    const bundled = await load(new URL(`${baseURL}/root.json`), { remoteHosts: ["127.0.0.1"] });
    const error = await loadFailure(new URL(`${otherHostURL}/root.json`), { remoteHosts: ["127.0.0.1"] });

    expect(bundled.components?.schemas?.person).toEqual(JSON.parse(PERSON));
    expect(error.details).toMatchObject({ ref: `${otherHostURL}/person.json` });
  });

  it("the refusal is reported when the Redocly config does not check unresolved refs", async () => {
    const root = await writeRoot("api/no-rule.json", `${otherHostURL}/person.json`);
    const loader = createRedoclySchemaLoader({
      redoc: await createConfig({ rules: { "no-unresolved-refs": "off" } }),
      logger: new RecordingLogger(),
      now: () => 0,
      remoteRefTimeoutMs: 2_000,
      remoteDocumentLimits: DEFAULT_REMOTE_DOCUMENT_LIMITS,
    });
    const request = { source: root, cwd: pathToFileURL(`${workDir}/`), shouldLint: true };

    await expect(loader.load({ ...request, refAccess: { remoteHosts: [] } })).rejects.toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
    });
  });
});

describe("local files from a remote document (T3)", () => {
  // `new URL("C:/x", "https://vendor/spec.yaml")` is `c:/x`, which Redocly reads from disk: on
  // Windows an absolute path, elsewhere a path relative to the working directory.
  it.each([
    ["a drive letter", "/drive-letter.json"],
    ["a file: URL", "/file-url.json"],
  ])("a $ref with %s in a remote document is refused, without any limits set", async (_, file) => {
    const error = await loadFailure(new URL(`${baseURL}${file}`), {});

    expect(error).toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      details: { reason: "local-ref-from-remote" },
    });
    expect(error.message).toMatch(/^Refused to load .*: it is not an http\(s\) URL, and the \$ref is in /);
  });
});

describe("Node API options", () => {
  it("openapiTS resolves a relative localRefRoot against cwd", async () => {
    const root = await writeRoot("api/node-api.json", "../secrets/person.json");

    const generation = openapiTS(root, { silent: true, cwd: workDir, localRefRoot: "api" });

    await expect(generation).rejects.toMatchObject({ code: "SCHEMA_REF_FORBIDDEN" });
  });

  it("openapiTS with remoteRefHosts generates from a listed host", async () => {
    const root = await writeRoot("api/node-remote.json", `${baseURL}/person.json`);

    const output = astToString(await openapiTS(root, { silent: true, remoteRefHosts: ["127.0.0.1"] }));

    expect(output).toContain("person: {");
  });
});
