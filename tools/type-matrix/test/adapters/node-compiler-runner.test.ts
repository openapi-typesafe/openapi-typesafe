import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NodeCompilerRunner } from "../../src/adapters/node-compiler-runner.ts";

const STAND_IN = fileURLToPath(new URL("../fixtures/stand-in-tsc.mjs", import.meta.url));
const CONSUMER_DIR = fileURLToPath(new URL("../fixtures", import.meta.url));
const NORMAL_TIMEOUT_MS = 10_000;
const SHORT_TIMEOUT_MS = 200;

function runner(timeoutMs: number): NodeCompilerRunner {
  let tick = 0;
  return new NodeCompilerRunner({
    consumerDir: CONSUMER_DIR,
    timeoutMs,
    now: () => (tick += 5),
    resolveCompiler: () => STAND_IN,
  });
}

describe("NodeCompilerRunner", () => {
  it("run of a passing project returns exit code 0 and its duration", async () => {
    const outcome = await runner(NORMAL_TIMEOUT_MS).run({
      packageName: "x",
      tsconfig: "pass.json",
    });

    expect(outcome).toEqual({ exitCode: 0, output: "", durationMs: 5 });
  });

  it("run of a failing project returns the exit code with stdout and stderr", async () => {
    const outcome = await runner(NORMAL_TIMEOUT_MS).run({ packageName: "x", tsconfig: "bad.json" });

    expect(outcome.exitCode).toBe(2);
    expect(outcome.output).toContain("bad.json(1,1): error TS2322: broken");
    expect(outcome.output).toContain("stderr note");
  });

  it("run longer than the timeout is killed and has no exit code", async () => {
    const outcome = await runner(SHORT_TIMEOUT_MS).run({ packageName: "x", tsconfig: "slow.json" });

    expect(outcome.exitCode).toBeNull();
    expect(outcome.output).toMatch(/abort/i);
  });

  it("the default resolver runs the bin/tsc of an installed compiler package", async () => {
    const real = new NodeCompilerRunner({
      consumerDir: CONSUMER_DIR,
      timeoutMs: NORMAL_TIMEOUT_MS,
    });

    const outcome = await real.run({
      packageName: "typescript-5.4",
      tsconfig: "tiny-project/tsconfig.json",
    });

    expect(outcome).toMatchObject({ exitCode: 0, output: "" });
  });
});
