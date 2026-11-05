import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "@redocly/openapi-core";
import { afterAll, describe, expect, it } from "vitest";
import openapiTS, { astToString } from "../../src/index.js";

/** Problems listed in `.redocly.lint-ignore.yaml` do not fail the run (upstream #2189). */

const TIMEOUT = 30_000;
const workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-ignore-")));
const documentFile = path.join(workDir, "openapi.yaml");
const configFile = path.join(workDir, "redocly.yaml");

// Two operations with the same ID: the default rules make the second one a lint error.
fs.writeFileSync(
  documentFile,
  `openapi: 3.1.0
info: { title: t, version: "1" }
paths:
  /a: { get: { operationId: same, responses: { "204": { description: none } } } }
  /b: { get: { operationId: same, responses: { "204": { description: none } } } }
`,
);
fs.writeFileSync(configFile, "extends: [minimal]\nrules:\n  operation-operationId-unique: error\n");

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

async function generate(): Promise<string> {
  const redocly = await loadConfig({ configPath: configFile });
  return astToString(await openapiTS(pathToFileURL(documentFile), { silent: true, redocly }));
}

describe("the lint ignore file", () => {
  it(
    "openapiTS without an ignore file fails on the lint error",
    async () => {
      await expect(generate()).rejects.toMatchObject({ code: "SCHEMA_INVALID" });
    },
    TIMEOUT,
  );

  it(
    "openapiTS skips the problems that the ignore file next to the config lists",
    async () => {
      fs.writeFileSync(
        path.join(workDir, ".redocly.lint-ignore.yaml"),
        // The pointer that `redocly lint --generate-ignore-file` writes for this rule.
        "openapi.yaml:\n  operation-operationId-unique:\n    - '#/paths/~1b/get/same'\n",
      );

      expect(await generate()).toContain('"/b": {');
    },
    TIMEOUT,
  );
});
