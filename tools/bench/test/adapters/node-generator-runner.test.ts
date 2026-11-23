import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GeneratorRunError,
  NodeGeneratorRunner,
} from "../../src/adapters/node-generator-runner.ts";

const STAND_IN_CLI = fileURLToPath(
  new URL("../fixtures/stand-in-generator/bin/cli.js", import.meta.url),
);
const NORMAL_TIMEOUT_MS = 10_000;
const SHORT_TIMEOUT_MS = 200;
const CLOCK_STEP_MS = 7;

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "bench-runner-test-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function runner(timeoutMs: number): NodeGeneratorRunner {
  let tick = 0;
  return new NodeGeneratorRunner({ workDir, timeoutMs, now: () => (tick += CLOCK_STEP_MS) });
}

describe("NodeGeneratorRunner", () => {
  it("run of a passing CLI returns its wall time from the clock and its peak memory", async () => {
    const measurement = await runner(NORMAL_TIMEOUT_MS).run({
      cliPath: STAND_IN_CLI,
      documentPath: join(workDir, "tiny.yaml"),
    });

    expect(measurement.wallMs).toBe(CLOCK_STEP_MS);
    // A Node process takes some megabytes; zero or NaN would mean the probe did not run.
    expect(measurement.peakRssBytes).toBeGreaterThan(1_000_000);
  });

  it("run passes the document and an output file in the work directory to the CLI", async () => {
    await runner(NORMAL_TIMEOUT_MS).run({ cliPath: STAND_IN_CLI, documentPath: "tiny.yaml" });

    expect(await readFile(join(workDir, "output.ts"), "utf8")).toBe("export interface paths {}\n");
  });

  it("run of a failing CLI rejects with its exit code and output", async () => {
    const run = runner(NORMAL_TIMEOUT_MS).run({
      cliPath: STAND_IN_CLI,
      documentPath: "broken.yaml",
    });

    await expect(run).rejects.toThrow(GeneratorRunError);
    await expect(run).rejects.toThrow(/exit code 1[\s\S]*cannot read broken\.yaml/);
  });

  it("run longer than the timeout is stopped and rejects", async () => {
    const run = runner(SHORT_TIMEOUT_MS).run({ cliPath: STAND_IN_CLI, documentPath: "slow.yaml" });

    await expect(run).rejects.toThrow(/exit code null[\s\S]*abort/i);
  });

  it("run whose probe wrote nothing rejects instead of reusing an earlier result", async () => {
    await writeFile(join(workDir, "peak-rss.txt"), "123");

    const run = runner(NORMAL_TIMEOUT_MS).run({
      cliPath: STAND_IN_CLI,
      documentPath: "abrupt.yaml",
    });

    await expect(run).rejects.toThrow(/without reporting its peak memory/);
  });

  it.each(["empty-memory.yaml", "cut-memory.yaml", "fraction-memory.yaml"])(
    "run whose probe file holds no whole positive number (%s) rejects",
    async (documentPath) => {
      const run = runner(NORMAL_TIMEOUT_MS).run({ cliPath: STAND_IN_CLI, documentPath });

      await expect(run).rejects.toThrow(/invalid peak memory/);
    },
  );

  it("the default clock measures a real, positive wall time", async () => {
    const real = new NodeGeneratorRunner({ workDir, timeoutMs: NORMAL_TIMEOUT_MS });

    const measurement = await real.run({ cliPath: STAND_IN_CLI, documentPath: "tiny.yaml" });

    expect(measurement.wallMs).toBeGreaterThan(0);
  });
});
