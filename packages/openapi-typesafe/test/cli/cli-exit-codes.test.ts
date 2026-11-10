import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import stripAnsi from "strip-ansi";
import { afterAll, describe, expect, it } from "vitest";
import { MULTIPLE_SCHEMAS_DOCS_URL } from "../../src/cli/docs-links.js";

/** End-to-end exit codes of the built CLI (ADR-011, docs/cli.md); needs `pnpm run build`. */

const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI = path.join(PACKAGE_ROOT, "bin/cli.js");
const SIMPLE_SCHEMA = path.join(PACKAGE_ROOT, "examples/simple-example.yaml");
const TIMEOUT = 30_000;
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-exit-"));

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

async function runCli(args: readonly string[], cwd = PACKAGE_ROOT) {
  const result = await execa("node", [CLI, ...args], { cwd, reject: false });
  return { exitCode: result.exitCode, stderr: stripAnsi(result.stderr) };
}

function workFile(name: string, contents?: string): string {
  const file = path.join(workDir, name);
  if (contents !== undefined) {
    fs.writeFileSync(file, contents);
  }
  return file;
}

describe("CLI exit codes", () => {
  it.each([
    [["-ap"], "CLI_FLAG_REMOVED"],
    [["--redoc", "a.yaml"], "CLI_FLAG_REMOVED"],
    [["schemas/*.yaml"], "CLI_GLOB_UNSUPPORTED"],
    [["--redocly", "no-such-redocly.yaml"], "CLI_CONFIG_NOT_FOUND"],
    [[SIMPLE_SCHEMA, "--check"], "CLI_CHECK_OUTPUT_MISSING"],
  ])(
    "cli %j exits with 2 and %s",
    async (args, code) => {
      const { exitCode, stderr } = await runCli(args);

      expect(exitCode).toBe(2);
      expect(stderr).toContain(`(${code})`);
    },
    TIMEOUT,
  );

  it.each([
    ["redocly.yaml", "apis: [\n  one: {\n"],
    [".redocly.lint-ignore.yaml", "a.yaml: [\n  b\n"],
  ])(
    "cli with a malformed %s exits with 2 and CLI_CONFIG_INVALID, without a stack trace",
    async (file, contents) => {
      const cwd = path.join(workDir, `malformed-${file}`);
      fs.mkdirSync(cwd, { recursive: true });
      fs.writeFileSync(path.join(cwd, file), contents);

      const { exitCode, stderr } = await runCli([SIMPLE_SCHEMA], cwd);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("(CLI_CONFIG_INVALID)");
      expect(stderr).not.toContain("    at ");
    },
    TIMEOUT,
  );

  it(
    "cli with a glob or an API without output links to this project's multiple-schemas docs",
    async () => {
      const cwd = path.join(workDir, "api-without-output");
      fs.mkdirSync(cwd, { recursive: true });
      fs.writeFileSync(path.join(cwd, "redocly.yaml"), `apis:\n  main:\n    root: ${SIMPLE_SCHEMA}\n`);

      const missingOutput = await runCli([], cwd);
      const glob = await runCli(["schemas/*.yaml"]);

      expect(missingOutput.exitCode).toBe(2);
      expect(missingOutput.stderr).toContain("(CLI_CONFIG_OUTPUT_MISSING)");
      for (const { stderr } of [missingOutput, glob]) {
        expect(stderr).toContain(MULTIPLE_SCHEMAS_DOCS_URL);
        expect(stderr).not.toContain("openapi-ts.dev");
      }
    },
    TIMEOUT,
  );

  it(
    "cli with a missing schema file exits with 3 and SCHEMA_LOAD_FAILED",
    async () => {
      const { exitCode, stderr } = await runCli([workFile("missing.yaml")]);

      expect(exitCode).toBe(3);
      expect(stderr).toMatch(/✘ {2}ENOENT: .* \(SCHEMA_LOAD_FAILED\)/);
    },
    TIMEOUT,
  );

  it(
    "cli with a Swagger 2 schema exits with 3 and SCHEMA_VERSION_UNSUPPORTED",
    async () => {
      const schema = workFile("swagger.yaml", 'swagger: "2.0"\ninfo: {title: a, version: "1"}\n');

      const { exitCode, stderr } = await runCli([schema]);

      expect(exitCode).toBe(3);
      expect(stderr).toContain("Use OpenAPI 3.x instead. (SCHEMA_VERSION_UNSUPPORTED)");
    },
    TIMEOUT,
  );

  it(
    "cli with a $ref cycle reached from two documents exits with 3 and SCHEMA_REF_INVALID, without a stack trace",
    async () => {
      const schema = fileURLToPath(new URL("../fixtures/late-ref-failures/self-ref/api.yaml", import.meta.url));

      const { exitCode, stderr } = await runCli([schema, "-o", workFile("self-ref.ts")]);

      expect(exitCode).toBe(3);
      expect(stderr).toContain("Self-referencing circular pointer (SCHEMA_REF_INVALID)");
      expect(stderr).not.toContain("    at ");
    },
    TIMEOUT,
  );

  it(
    "cli with lint errors prints each one, then exits with 3 and SCHEMA_INVALID",
    async () => {
      const cwd = fileURLToPath(new URL("../fixtures/redocly-lint-error/", import.meta.url));

      const { exitCode, stderr } = await runCli([], cwd);

      expect(exitCode).toBe(3);
      // Each problem line names the API of redocly.yaml it belongs to.
      expect(stderr).toMatch(/✘ {2}API a@v1: Servers must be present/);
      expect(stderr).toMatch(/The OpenAPI document has \d+ errors? \(see above\) \(SCHEMA_INVALID\)/);
    },
    TIMEOUT,
  );

  it(
    "cli --check with up-to-date output exits with 0",
    async () => {
      const output = workFile("fresh.ts");
      await runCli([SIMPLE_SCHEMA, "-o", output]);

      const { exitCode } = await runCli([SIMPLE_SCHEMA, "-o", output, "--check"]);

      expect(exitCode).toBe(0);
    },
    TIMEOUT,
  );

  it(
    "cli --check with changed output exits with 1 and OUTPUT_STALE",
    async () => {
      const output = workFile("stale.ts", "export type Old = 1;\n");

      const { exitCode, stderr } = await runCli([SIMPLE_SCHEMA, "-o", output, "--check"]);

      expect(exitCode).toBe(1);
      expect(stderr).toContain(`Generated types are not up-to-date! ${output} differs`);
      expect(stderr).toContain("(OUTPUT_STALE)");
    },
    TIMEOUT,
  );

  it(
    "cli --check with no output file exits with 4 and OUTPUT_READ_FAILED",
    async () => {
      const output = workFile("never-written.ts");

      const { exitCode, stderr } = await runCli([SIMPLE_SCHEMA, "-o", output, "--check"]);

      expect(exitCode).toBe(4);
      expect(stderr).toContain("(OUTPUT_READ_FAILED)");
    },
    TIMEOUT,
  );

  it(
    "cli --check with several Redocly APIs exits with 1 when any output is stale",
    async () => {
      const project = path.join(workDir, "apis");
      fs.mkdirSync(project, { recursive: true });
      fs.copyFileSync(SIMPLE_SCHEMA, path.join(project, "schema.yaml"));
      const apis = ["fresh", "stale"].map(
        (name) => `  ${name}:\n    root: ./schema.yaml\n    x-openapi-ts:\n      output: ./${name}.ts\n`,
      );
      fs.writeFileSync(path.join(project, "redocly.yaml"), `apis:\n${apis.join("")}`);
      await runCli([], project);
      fs.writeFileSync(path.join(project, "stale.ts"), "export type Old = 1;\n");

      const { exitCode, stderr } = await runCli(["--check"], project);

      expect(exitCode).toBe(1);
      expect(stderr).toContain("(OUTPUT_STALE)");
    },
    TIMEOUT,
  );

  it(
    "cli with an output path under a file exits with 4 and OUTPUT_WRITE_FAILED",
    async () => {
      const blocker = workFile("blocker", "a file, not a directory");

      const { exitCode, stderr } = await runCli([SIMPLE_SCHEMA, "-o", path.join(blocker, "a.ts")]);

      expect(exitCode).toBe(4);
      expect(stderr).toContain("(OUTPUT_WRITE_FAILED)");
    },
    TIMEOUT,
  );

  it(
    "cli with an output that links to the schema exits with 2 and leaves the schema unchanged",
    async () => {
      const schemaText = fs.readFileSync(SIMPLE_SCHEMA, "utf8");
      const schema = workFile("linked-schema.yaml", schemaText);
      const link = workFile("schema-link.yaml");
      fs.symlinkSync(schema, link);

      const { exitCode, stderr } = await runCli([schema, "-o", link]);

      expect(exitCode).toBe(2);
      expect(stderr).toContain("(CLI_OUTPUT_IS_INPUT)");
      expect(fs.readFileSync(schema, "utf8")).toBe(schemaText);
    },
    TIMEOUT,
  );
});
