import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CliGeneratorRunner } from "../../src/adapters/cli-generator-runner.ts";
import { useTemporaryDirectory } from "./temporary-directory.ts";

const createDirectory = useTemporaryDirectory();
const FAKE_CLI = fileURLToPath(new URL("fixtures/fake-generator-cli.mjs", import.meta.url));

async function runWith(mode: string, timeoutMs = 10_000) {
  const directory = await realpath(await createDirectory());
  const run = {
    schemaPath: join(directory, "schema.json"),
    outputPath: join(directory, "out/nested/schema.ts"),
    flags: [mode],
    timeoutMs,
  };
  return { run, outcome: await new CliGeneratorRunner(FAKE_CLI).run(run), directory };
}

describe("CliGeneratorRunner", () => {
  it("run passes schema, output and flags, creates the output directory and runs next to the schema", async () => {
    const { run, outcome, directory } = await runWith("--mode=ok");

    expect(outcome).toMatchObject({ exitCode: 0, isTimedOut: false, stderr: "" });
    expect(await readFile(run.outputPath, "utf8")).toBe(
      `// generated from ${run.schemaPath} in ${directory}\n`,
    );
  });

  it("run reports the exit code and stderr of a failing generator", async () => {
    const { run, outcome } = await runWith("--mode=fail");

    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(`Error: cannot read ${run.schemaPath}\n`);
  });

  it("run kills a generator that exceeds the timeout", async () => {
    const { outcome } = await runWith("--mode=hang", 300);

    expect(outcome.isTimedOut).toBe(true);
    expect(outcome.exitCode).toBeNull();
  });

  it("run measures the duration with the injected clock", async () => {
    const ticks = [100, 350];
    const runner = new CliGeneratorRunner(FAKE_CLI, () => ticks.shift() ?? 0);
    const directory = await createDirectory();

    const outcome = await runner.run({
      schemaPath: join(directory, "schema.json"),
      outputPath: join(directory, "schema.ts"),
      flags: [],
      timeoutMs: 10_000,
    });

    expect(outcome.durationMs).toBe(250);
  });
});
