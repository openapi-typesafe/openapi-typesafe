import { describe, expect, it } from "vitest";
import { runMatrix } from "../../src/application/run-matrix.ts";
import type { MatrixCell } from "../../src/domain/matrix.ts";
import { FakeCompilerRunner } from "../fakes/fake-compiler-runner.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";

const CELLS: readonly MatrixCell[] = [
  {
    version: { id: "5.4", packageName: "typescript-5.4", isBlocking: true },
    project: { id: "strict", tsconfig: "tsconfig.json" },
  },
  {
    version: { id: "7.0", packageName: "typescript-7.0", isBlocking: true },
    project: { id: "strict-flags", tsconfig: "tsconfig.strict-flags.json" },
  },
];

describe("runMatrix", () => {
  it("runMatrix runs each cell with its compiler package and tsconfig, in order", async () => {
    const compiler = new FakeCompilerRunner();

    await runMatrix({ compiler, logger: new RecordingLogger() }, CELLS);

    expect(compiler.runs).toEqual([
      { packageName: "typescript-5.4", tsconfig: "tsconfig.json" },
      { packageName: "typescript-7.0", tsconfig: "tsconfig.strict-flags.json" },
    ]);
  });

  it("runMatrix reports a non-zero exit code as a failure with its output, and logs it", async () => {
    const failure = { exitCode: 2, output: "a.ts(1,1): error TS2322", durationMs: 7 };
    const compiler = new FakeCompilerRunner({
      "typescript-7.0 tsconfig.strict-flags.json": failure,
    });
    const logger = new RecordingLogger();

    const results = await runMatrix({ compiler, logger }, CELLS);

    expect(results.map((result) => result.isPassed)).toEqual([true, false]);
    expect(results[1]?.output).toBe("a.ts(1,1): error TS2322");
    expect(logger.records.map((record) => `${record.level}:${record.event}`)).toEqual([
      "info:check_passed",
      "error:check_failed",
    ]);
    expect(logger.records[1]?.fields).toMatchObject({ typescript: "7.0", exitCode: 2 });
  });

  it("runMatrix treats a timed-out compiler (no exit code) as a failure", async () => {
    const timedOut = { exitCode: null, output: "The operation was aborted", durationMs: 9 };
    const compiler = new FakeCompilerRunner({ "typescript-5.4 tsconfig.json": timedOut });

    const results = await runMatrix({ compiler, logger: new RecordingLogger() }, CELLS);

    expect(results[0]?.isPassed).toBe(false);
  });
});
