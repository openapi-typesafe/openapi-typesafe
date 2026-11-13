import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import openapiTS, { astToString } from "../../src/index.js";

/** A relative `file:` URL given as text loads the file in `cwd`, as the CLI argument does. */

const SIMPLE_SCHEMA = fileURLToPath(new URL("../../examples/simple-example.yaml", import.meta.url));
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-location-text-"));
fs.copyFileSync(SIMPLE_SCHEMA, path.join(workDir, "api.yaml"));
const RELATIVE_FILE_URL = "file:api.yaml";

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("openapiTS with location text", () => {
  it.each([
    ["a string", () => RELATIVE_FILE_URL],
    ["a buffer", () => Buffer.from(RELATIVE_FILE_URL)],
    ["a stream", () => Readable.from([RELATIVE_FILE_URL])],
  ])("openapiTS with a relative file: URL in %s loads the file in cwd", async (_, source) => {
    const document = fs.readFileSync(SIMPLE_SCHEMA, "utf8");
    const expected = astToString(await openapiTS(document, { silent: true }));

    const types = astToString(await openapiTS(source(), { cwd: workDir, silent: true }));

    expect(types).toBe(expected);
  });
});

describe("openapiTS with location text and a remote cwd", () => {
  it.each([
    ["a string", () => RELATIVE_FILE_URL, "The string"],
    ["a stream", () => Readable.from([RELATIVE_FILE_URL]), "The stream text"],
  ])(
    "openapiTS with a relative file: URL in %s and an https: cwd rejects with SCHEMA_SOURCE_INVALID",
    async (_, source, name) => {
      const run = openapiTS(source(), { cwd: "https://example.invalid/specs/", silent: true });

      await expect(run).rejects.toMatchObject({
        code: "SCHEMA_SOURCE_INVALID",
        message:
          `${name} file:api.yaml is a relative file: URL, which needs a file: cwd; cwd is a ` +
          "https: URL. Pass an absolute file: URL or a local cwd",
        details: { reason: "relative-file", text: RELATIVE_FILE_URL },
      });
    },
  );
});
