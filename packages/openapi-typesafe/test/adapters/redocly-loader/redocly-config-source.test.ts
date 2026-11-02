import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createRedoclyConfigSource } from "../../../src/adapters/redocly-loader/redocly-config-source.js";

const TIMEOUT = 30_000;
const workDir = fs.realpathSync(
  fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-redocly-")),
);
const configDir = path.join(workDir, "config");
const configFile = path.join(configDir, "redocly.yaml");
const emptyDir = path.join(workDir, "empty");
fs.mkdirSync(configDir);
fs.mkdirSync(emptyDir);
fs.writeFileSync(
  configFile,
  "apis:\n  main:\n    root: ./openapi.yaml\n    x-openapi-ts:\n      output: ./types.ts\n",
);

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

describe("createRedoclyConfigSource", () => {
  it("find without a path searches the working directory", () => {
    expect(createRedoclyConfigSource(configDir).find(undefined)).toBe(configFile);
    expect(createRedoclyConfigSource(emptyDir).find(undefined)).toBeUndefined();
  });

  it("find with a relative file path resolves it from the working directory", () => {
    expect(createRedoclyConfigSource(workDir).find("config/redocly.yaml")).toBe(configFile);
  });

  it("find with a directory searches that directory", () => {
    expect(createRedoclyConfigSource(workDir).find("config")).toBe(configFile);
  });

  it("find with a missing path finds nothing", () => {
    expect(createRedoclyConfigSource(workDir).find("missing.yaml")).toBeUndefined();
  });

  it(
    "load reads the APIs and the config file path",
    async () => {
      const config = await createRedoclyConfigSource(workDir).load(configFile);

      expect(Object.keys(config.apis)).toEqual(["main"]);
      expect(config.configFile).toBe(configFile);
    },
    TIMEOUT,
  );

  it(
    "createDefault has no APIs",
    async () => {
      const config = await createRedoclyConfigSource(workDir).createDefault();

      expect(config.apis).toEqual({});
    },
    TIMEOUT,
  );

  it(
    "createDefault warns about a repeated operationId, whose output does not compile",
    async () => {
      // A warning, not an error as in the Node API: the CLI wrote such files before, and projects
      // with `skipLibCheck` use them.
      const config = await createRedoclyConfigSource(workDir).createDefault();

      expect(config.styleguide.rules.oas3_1["operation-operationId-unique"]).toEqual({
        severity: "warn",
      });
    },
    TIMEOUT,
  );
});
