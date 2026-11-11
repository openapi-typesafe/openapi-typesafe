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
    "load of a config that is no YAML fails with CLI_CONFIG_INVALID",
    async () => {
      const brokenDir = path.join(workDir, "broken");
      fs.mkdirSync(brokenDir, { recursive: true });
      const broken = path.join(brokenDir, "redocly.yaml");
      fs.writeFileSync(broken, "apis: [\n  one: {\n");

      const failure = createRedoclyConfigSource(workDir).load(broken);

      await expect(failure).rejects.toMatchObject({
        code: "CLI_CONFIG_INVALID",
        details: { configPath: broken },
      });
      await expect(failure).rejects.toThrow(`Cannot load the Redocly config ${broken}`);
    },
    TIMEOUT,
  );

  it(
    "load with a lint-ignore file that is no YAML fails with CLI_CONFIG_INVALID",
    async () => {
      const ignoreDir = path.join(workDir, "ignore");
      fs.mkdirSync(ignoreDir, { recursive: true });
      const config = path.join(ignoreDir, "redocly.yaml");
      fs.writeFileSync(config, "extends: [minimal]\n");
      fs.writeFileSync(path.join(ignoreDir, ".redocly.lint-ignore.yaml"), "a.yaml: [\n  b\n");

      const failure = createRedoclyConfigSource(workDir).load(config);

      await expect(failure).rejects.toMatchObject({ code: "CLI_CONFIG_INVALID" });
      await expect(failure).rejects.toThrow(".redocly.lint-ignore.yaml");
    },
    TIMEOUT,
  );

  it(
    "createDefault with a lint-ignore file in the working directory that is no YAML fails with CLI_CONFIG_INVALID",
    async () => {
      // Without a config file, Redocly reads the lint-ignore file from the process's directory.
      const processDir = path.join(workDir, "process");
      fs.mkdirSync(processDir, { recursive: true });
      fs.writeFileSync(path.join(processDir, ".redocly.lint-ignore.yaml"), "a.yaml: [\n  b\n");
      const previousDir = process.cwd();
      process.chdir(processDir);

      try {
        const failure = createRedoclyConfigSource(workDir).createDefault();

        await expect(failure).rejects.toMatchObject({
          code: "CLI_CONFIG_INVALID",
          details: { configPath: undefined },
        });
        await expect(failure).rejects.toThrow(
          /^Cannot load the default Redocly config or the \.redocly\.lint-ignore\.yaml in the working directory: YAMLException: [^\n]+$/,
        );
      } finally {
        process.chdir(previousDir);
      }
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

  it(
    "forApi gives an API its own rules and the root rules to an API without them",
    async () => {
      const rulesDir = path.join(workDir, "rules");
      fs.mkdirSync(rulesDir, { recursive: true });
      const config = path.join(rulesDir, "redocly.yaml");
      fs.writeFileSync(
        config,
        [
          "extends: [minimal]",
          "rules: { info-contact: warn }",
          "apis:",
          "  strict: { root: ./a.yaml, rules: { info-contact: error } }",
          "  plain: { root: ./a.yaml }",
        ].join("\n"),
      );
      const source = createRedoclyConfigSource(workDir);
      const loaded = await source.load(config);

      const severityOf = (api: string) =>
        source.forApi(loaded, api).styleguide.rules.oas3_1["info-contact"];

      expect([severityOf("strict"), severityOf("plain")]).toEqual(["error", "warn"]);
      expect(source.forApi(loaded, "strict").configFile).toBe(config);
    },
    TIMEOUT,
  );
});
