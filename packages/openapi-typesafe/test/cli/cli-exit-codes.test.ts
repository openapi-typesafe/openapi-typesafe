import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import stripAnsi from "strip-ansi";
import { afterAll, describe, expect, it } from "vitest";

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
  ])(
    "cli %j exits with 2 and %s",
    async (args, code) => {
      const { exitCode, stderr } = await runCli(args);

      expect(exitCode).toBe(2);
      expect(stderr).toContain(`(${code})`);
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
    "cli with lint errors prints each one, then exits with 3 and SCHEMA_INVALID",
    async () => {
      const cwd = fileURLToPath(new URL("../fixtures/redocly-lint-error/", import.meta.url));

      const { exitCode, stderr } = await runCli([], cwd);

      expect(exitCode).toBe(3);
      expect(stderr).toMatch(/✘ {2}Servers must be present/);
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
      expect(stderr).toContain("Generated types are not up-to-date! (OUTPUT_STALE)");
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
    "cli with an output path under a file exits with 4 and OUTPUT_WRITE_FAILED",
    async () => {
      const blocker = workFile("blocker", "a file, not a directory");

      const { exitCode, stderr } = await runCli([SIMPLE_SCHEMA, "-o", path.join(blocker, "a.ts")]);

      expect(exitCode).toBe(4);
      expect(stderr).toContain("(OUTPUT_WRITE_FAILED)");
    },
    TIMEOUT,
  );
});
