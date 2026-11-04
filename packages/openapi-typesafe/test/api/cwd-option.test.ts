import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import openapiTS, { astToString } from "../../src/index.js";
import type { GeneratorOptions } from "../../src/types.js";

/** A directory with `pet.yaml`; the inline documents below point at it as `./pet.yaml`. */
const FIXTURE_URL = new URL("../fixtures/cwd-relative-ref/", import.meta.url);
const FIXTURE_PATH = fileURLToPath(FIXTURE_URL);
const PET_TYPE = "name?: string";
const DOCUMENT_YAML = [
  "openapi: 3.0.0",
  "info: { title: Test, version: '1.0' }",
  "paths: {}",
  "components:",
  "  schemas:",
  "    Pet: { $ref: './pet.yaml' }",
].join("\n");
const DOCUMENT_OBJECT = {
  openapi: "3.0.0",
  info: { title: "Test", version: "1.0" },
  paths: {},
  components: { schemas: { Pet: { $ref: "./pet.yaml" } } },
};
const temporaryDirectories: string[] = [];

async function printed(source: unknown, cwd: GeneratorOptions["cwd"]): Promise<string> {
  return astToString(await openapiTS(source as never, { cwd, silent: true }));
}

/** A copy of the fixture in a directory whose name must be percent-encoded in a URL. */
async function fixtureCopyWithSpecialName(): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "openapi-typesafe-cwd-"));
  temporaryDirectories.push(parent);
  const directory = path.join(parent, "a #b %c");
  await fs.mkdir(directory);
  await fs.copyFile(path.join(FIXTURE_PATH, "pet.yaml"), path.join(directory, "pet.yaml"));
  return directory;
}

afterAll(async () => {
  await Promise.all(temporaryDirectories.map((directory) => fs.rm(directory, { recursive: true })));
});

describe("cwd option", () => {
  it("openapiTS with a string source and a path cwd resolves relative refs in the cwd", async () => {
    expect(await printed(DOCUMENT_YAML, FIXTURE_PATH)).toContain(PET_TYPE);
  });

  it("openapiTS with an object source and a URL cwd resolves relative refs in the cwd", async () => {
    expect(await printed(DOCUMENT_OBJECT, FIXTURE_URL)).toContain(PET_TYPE);
  });

  it("openapiTS with a URL cwd without a trailing slash treats it as a directory", async () => {
    const withoutSlash = new URL(FIXTURE_URL.href.replace(/\/$/, ""));

    expect(await printed(DOCUMENT_OBJECT, withoutSlash)).toContain(PET_TYPE);
  });

  it("openapiTS with a Buffer cwd resolves relative refs in the cwd", async () => {
    expect(await printed(DOCUMENT_OBJECT, Buffer.from(FIXTURE_PATH))).toContain(PET_TYPE);
  });

  it("openapiTS with a stream source resolves relative refs in the cwd", async () => {
    const stream = Readable.from([DOCUMENT_YAML]);

    expect(await printed(stream, pathToFileURL(FIXTURE_PATH + path.sep))).toContain(PET_TYPE);
  });

  it("openapiTS with a cwd path holding # and % resolves relative refs in it", async () => {
    const directory = await fixtureCopyWithSpecialName();

    expect(await printed(DOCUMENT_OBJECT, directory)).toContain(PET_TYPE);
  });
});
