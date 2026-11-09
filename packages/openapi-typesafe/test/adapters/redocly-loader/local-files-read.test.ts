import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { BaseResolver, Document } from "@redocly/openapi-core";
import { afterAll, describe, expect, it } from "vitest";
import { localFilesRead } from "../../../src/adapters/redocly-loader/loaded-documents.js";
import { createRedoclySchemaLoader } from "../../../src/adapters/redocly-loader/redocly-schema-loader.js";
import {
  DEFAULT_REMOTE_DOCUMENT_LIMITS,
  defaultRedoclyConfig,
} from "../../../src/api/default-ports.js";
import type { SchemaSource } from "../../../src/types.js";
import { RecordingLogger } from "../../fakes/cli-dependencies.js";

/** The loader lists the local files it read, so the CLI can keep its output off them (G11). */

const workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-read-")));
const ROOT =
  'openapi: 3.1.0\ninfo: { title: t, version: "1" }\npaths: {}\n' +
  'components: { schemas: { A: { $ref: "./models.yaml#/M" } } }\n';

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

fs.writeFileSync(path.join(workDir, "api.yaml"), ROOT);
fs.writeFileSync(path.join(workDir, "models.yaml"), "M: { type: string }\n");

async function localFilesOf(source: SchemaSource): Promise<string[]> {
  const loader = createRedoclySchemaLoader({
    redoc: await defaultRedoclyConfig(),
    logger: new RecordingLogger(),
    now: () => 0,
    remoteRefTimeoutMs: 1000,
    remoteDocumentLimits: DEFAULT_REMOTE_DOCUMENT_LIMITS,
  });
  const loaded = await loader.load({
    source,
    cwd: pathToFileURL(`${workDir}${path.sep}`),
    shouldLint: false,
    refAccess: {},
  });
  return loaded.localFiles.map((file) => file.href).sort();
}

describe("RedoclySchemaLoader: local files read", () => {
  it("load of a file lists the file and every local file its $refs load", async () => {
    const files = await localFilesOf(pathToFileURL(path.join(workDir, "api.yaml")));

    expect(files).toEqual([
      pathToFileURL(path.join(workDir, "api.yaml")).href,
      pathToFileURL(path.join(workDir, "models.yaml")).href,
    ]);
  });

  it("load of an inline source lists the $ref'd files but not the made-up name of the source", async () => {
    const files = await localFilesOf(ROOT);

    expect(files).toEqual([pathToFileURL(path.join(workDir, "models.yaml")).href]);
  });

  it("localFilesRead skips a $ref that failed to load and lists the others", async () => {
    const failed = Promise.reject(new Error("401 Unauthorized"));
    failed.catch(() => undefined);
    const models = path.join(workDir, "models.yaml");
    const cache = new Map<string, Promise<unknown>>([
      ["https://example.com/a.yaml", failed],
      [models, Promise.resolve({ source: { absoluteRef: models }, parsed: {} })],
    ]);
    const root = {
      source: { absoluteRef: path.join(workDir, "api.yaml") },
      parsed: {},
    } as Document;

    const files = await localFilesRead(root, { cache } as unknown as BaseResolver, true);

    expect(files.map((file) => file.href)).toEqual([
      pathToFileURL(path.join(workDir, "api.yaml")).href,
      pathToFileURL(models).href,
    ]);
  });
});
