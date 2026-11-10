import fs from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRedoclySchemaLoader } from "../../../src/adapters/redocly-loader/redocly-schema-loader.js";
import {
  DEFAULT_REMOTE_DOCUMENT_LIMITS,
  defaultRedoclyConfig,
} from "../../../src/api/default-ports.js";
import { RecordingLogger } from "../../fakes/cli-dependencies.js";

/**
 * A discriminator mapping by schema name in a document a `$ref` loads names that document's
 * `components.schemas`, as in the root; a problem in such a document names the document.
 */

const workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-map-")));

/** Serves the pets document with a mapping to no schema, at any URL. */
const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/yaml" });
  response.end(petsWith("Nope"));
});
let serverOrigin = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  fs.rmSync(workDir, { recursive: true, force: true });
  await new Promise((resolve) => server.close(resolve));
});

function rootWith(petsRef: string): string {
  return (
    'openapi: 3.1.0\ninfo: { title: t, version: "1" }\n' +
    "paths:\n  /pets:\n    get:\n      responses:\n        '200':\n          description: ok\n" +
    `          content: { application/json: { schema: { $ref: '${petsRef}#/components/schemas/Pet' } } }\n`
  );
}

function petsWith(mappedName: string): string {
  return (
    "components:\n  schemas:\n" +
    `    Pet: { oneOf: [{ $ref: '#/components/schemas/Dog' }], discriminator: { propertyName: kind, mapping: { dog: ${mappedName} } } }\n` +
    "    Dog: { type: object, required: [kind], properties: { kind: { type: string } } }\n"
  );
}

async function load(directory: string, mappedName: string, petsRef = "./pets.yaml") {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "api.yaml"), rootWith(petsRef));
  fs.writeFileSync(path.join(directory, "pets.yaml"), petsWith(mappedName));
  const logger = new RecordingLogger();
  const loader = createRedoclySchemaLoader({
    redoc: await defaultRedoclyConfig(),
    logger,
    now: () => 0,
    remoteRefTimeoutMs: 1000,
    remoteDocumentLimits: DEFAULT_REMOTE_DOCUMENT_LIMITS,
  });
  const loading = loader.load({
    source: pathToFileURL(path.join(directory, "api.yaml")),
    cwd: pathToFileURL(`${directory}${path.sep}`),
    shouldLint: false,
    refAccess: {},
  });
  return { loading, logger };
}

describe("mapping names in a referenced document", () => {
  it("load points a mapping name at the referenced document's schema", async () => {
    const { loading } = await load(path.join(workDir, "named"), "Dog");

    const { document } = await loading;

    const pet = document.components?.schemas?.Pet as { discriminator: { mapping: object } };
    expect(pet.discriminator.mapping).toEqual({ dog: "#/components/schemas/Dog" });
  });

  it("load with a mapping to no schema names the document in the problem", async () => {
    const directory = path.join(workDir, "missing");
    const { loading, logger } = await load(directory, "Nope");

    await expect(loading).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    expect(logger.messages("error")).toEqual([
      `Can't resolve $ref at #/components/schemas/Pet/discriminator/mapping/dog in ${path.join(directory, "pets.yaml")}`,
    ]);
  });

  it("load names a remote document in the problem without its query", async () => {
    const petsRef = `${serverOrigin}/pets.yaml?key=secret`;
    const { loading, logger } = await load(path.join(workDir, "remote"), "Dog", petsRef);

    await expect(loading).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    expect(logger.messages("error")[0]).toBe(
      `Can't resolve $ref at #/components/schemas/Pet/discriminator/mapping/dog in ${serverOrigin}/pets.yaml?***`,
    );
  });
});
