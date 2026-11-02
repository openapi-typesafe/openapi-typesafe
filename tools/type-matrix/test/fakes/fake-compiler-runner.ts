import type { CompilerOutcome, CompilerRun, CompilerRunner } from "../../src/application/ports.ts";

/** Answers each run from a table keyed by `<packageName> <tsconfig>`; records the runs. */
export class FakeCompilerRunner implements CompilerRunner {
  readonly runs: CompilerRun[] = [];
  readonly #outcomes: ReadonlyMap<string, CompilerOutcome>;

  constructor(outcomes: Readonly<Record<string, CompilerOutcome>> = {}) {
    this.#outcomes = new Map(Object.entries(outcomes));
  }

  async run(run: CompilerRun): Promise<CompilerOutcome> {
    this.runs.push(run);
    return (
      this.#outcomes.get(`${run.packageName} ${run.tsconfig}`) ?? {
        exitCode: 0,
        output: "",
        durationMs: 1,
      }
    );
  }
}
