import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import stripAnsi from "strip-ansi";
import { afterAll, describe, expect, it } from "vitest";
import { pathStringError, urlInvalidError } from "../../src/adapters/redocly-loader/schema-load-errors.js";
import { runCli } from "../../src/cli/run-cli.js";
import { OpenAPITypesafeError } from "../../src/domain/errors.js";
import { createFakeCli } from "../fakes/cli-dependencies.js";

/**
 * A location on stdin is loaded as the same schema argument would be (docs/cli.md). The
 * end-to-end tests run the built CLI; they need `pnpm run build`.
 */

const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI = path.join(PACKAGE_ROOT, "bin/cli.js");
const SIMPLE_SCHEMA = path.join(PACKAGE_ROOT, "examples/simple-example.yaml");
const TIMEOUT = 30_000;
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-stdin-location-"));
fs.copyFileSync(SIMPLE_SCHEMA, path.join(workDir, "api.yaml"));

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

async function runBuiltCli(args: readonly string[], input?: string) {
  const result = await execa("node", [CLI, ...args], {
    cwd: workDir,
    reject: false,
    ...(input === undefined ? {} : { input }),
  });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: stripAnsi(result.stderr) };
}

describe("CLI with a location on stdin", () => {
  it.each(["file:api.yaml", "http://[::1/x"])(
    "CLI with %s on stdin ends as with it as the schema argument",
    async (location) => {
      const asArgument = await runBuiltCli([location]);

      const onStdin = await runBuiltCli([], location);

      expect(onStdin).toEqual(asArgument);
    },
    TIMEOUT,
  );

  it(
    "CLI with a relative file: URL on stdin prints the types of the file in the cwd",
    async () => {
      const { exitCode, stdout } = await runBuiltCli([], "file:api.yaml\n");

      expect(exitCode).toBe(0);
      expect(stdout).toContain("export interface paths");
    },
    TIMEOUT,
  );
});

describe("runCli with a location on stdin", () => {
  it("runCli with a URL on stdin that does not parse fails with CLI_LOCATION_INVALID", async () => {
    const cli = createFakeCli();
    cli.generator.failures.set("stdin", urlInvalidError("http://user:SECRET@[::1/x", "stream"));

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(2);
    expect(cli.logger.messages("error")).toEqual([
      "The location http://***@[::1/x is not a valid URL (CLI_LOCATION_INVALID)",
    ]);
  });

  it("runCli with a schema argument keeps the loader's code for a URL that does not parse", async () => {
    const cli = createFakeCli();
    cli.generator.failures.set(new URL("file:a.yaml", cli.deps.cwd).href, urlInvalidError("x://[", "string"));

    const exitCode = await runCli(["a.yaml"], cli.deps);

    expect(exitCode).toBe(3);
    expect(cli.logger.messages("error")[0]).toContain("(SCHEMA_SOURCE_INVALID)");
  });

  it("runCli with only a YAML string on stdin keeps the loader's code and the stdin advice", async () => {
    const cli = createFakeCli();
    cli.generator.failures.set("stdin", pathStringError("api.yaml", "stream"));

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(3);
    expect(cli.logger.messages("error")[0]).toMatch(/^stdin held only .*\(SCHEMA_SOURCE_INVALID\)$/);
  });

  it("runCli with stdin keeps another code with the same details as it is", async () => {
    const cli = createFakeCli();
    const details = { reason: "url", text: "http://[::1/x" };
    cli.generator.failures.set(
      "stdin",
      new OpenAPITypesafeError({ code: "SCHEMA_LOAD_FAILED", message: "x", details }),
    );

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(3);
    expect(cli.logger.messages("error")).toEqual(["x (SCHEMA_LOAD_FAILED)"]);
  });

  it("runCli with stdin keeps other failures of the source as they are", async () => {
    const cli = createFakeCli();
    cli.generator.failures.set("stdin", new Error("boom"));

    const exitCode = await runCli([], cli.deps);

    expect(exitCode).toBe(70);
  });
});
