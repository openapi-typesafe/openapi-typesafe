import type { CheckOutcome, ProjectChecks } from "../application/ports.ts";
import type { ProcessRunner } from "./node-process-runner.ts";

export interface NodeProjectChecksOptions {
  readonly runner: ProcessRunner;
  /** `typescript/bin/tsc` of the installed compiler. */
  readonly typescriptCli: string;
  /** `vitest/vitest.mjs` of the installed test runner. */
  readonly vitestCli: string;
  readonly timeoutMs: number;
}

/** Runs `tsc --noEmit` and `vitest run` in a workspace with the current Node.js. */
export class NodeProjectChecks implements ProjectChecks {
  readonly #options: NodeProjectChecksOptions;

  constructor(options: NodeProjectChecksOptions) {
    this.#options = options;
  }

  typecheck(directory: string): Promise<CheckOutcome> {
    return this.#check(directory, [this.#options.typescriptCli, "--noEmit", "-p", "tsconfig.json"]);
  }

  test(directory: string): Promise<CheckOutcome> {
    return this.#check(directory, [this.#options.vitestCli, "run"]);
  }

  async #check(directory: string, args: readonly string[]): Promise<CheckOutcome> {
    const outcome = await this.#options.runner.run({
      command: [process.execPath, ...args],
      cwd: directory,
      timeoutMs: this.#options.timeoutMs,
    });
    return { isPassed: outcome.exitCode === 0 && !outcome.isTimedOut, output: outcome.outputTail };
  }
}
