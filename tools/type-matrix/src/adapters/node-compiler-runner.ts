import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { CompilerOutcome, CompilerRun, CompilerRunner } from "../application/ports.ts";

/** Enough output for the first errors of a failed check; the rest is dropped to bound memory. */
const MAX_OUTPUT_LENGTH = 65_536;

export interface NodeCompilerRunnerOptions {
  /** The directory that holds the consumer tsconfig files; `tsc` runs there. */
  readonly consumerDir: string;
  readonly timeoutMs: number;
  /** A monotonic millisecond clock, injected so durations are testable. */
  readonly now?: () => number;
  /** Finds the `tsc` script of a compiler package; injected so tests can use a stand-in. */
  readonly resolveCompiler?: (packageName: string) => string;
}

const require = createRequire(import.meta.url);

/** The `bin/tsc` script of an installed (aliased) `typescript` package. */
function resolveInstalledCompiler(packageName: string): string {
  return join(dirname(require.resolve(`${packageName}/package.json`)), "bin", "tsc");
}

/** Runs `node <tsc> -p <tsconfig>` of one compiler package in a child process. */
export class NodeCompilerRunner implements CompilerRunner {
  readonly #options: NodeCompilerRunnerOptions;
  readonly #now: () => number;
  readonly #resolveCompiler: (packageName: string) => string;

  constructor(options: NodeCompilerRunnerOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => performance.now());
    this.#resolveCompiler = options.resolveCompiler ?? resolveInstalledCompiler;
  }

  async run(run: CompilerRun): Promise<CompilerOutcome> {
    const startedAt = this.#now();
    const child = spawn(
      process.execPath,
      [this.#resolveCompiler(run.packageName), "-p", run.tsconfig],
      {
        cwd: this.#options.consumerDir,
        stdio: ["ignore", "pipe", "pipe"],
        signal: AbortSignal.timeout(this.#options.timeoutMs),
      },
    );
    let output = "";
    const collect = (chunk: string): void => {
      output = (output + chunk).slice(0, MAX_OUTPUT_LENGTH);
    };
    child.stdout.setEncoding("utf8").on("data", collect);
    child.stderr.setEncoding("utf8").on("data", collect);
    return new Promise((resolve) => {
      // A timed-out spawn emits "error" with an AbortError, then "close" with a null exit code.
      child.on("error", (error) => collect(error.message));
      child.on("close", (exitCode) => {
        resolve({ exitCode, output, durationMs: Math.round(this.#now() - startedAt) });
      });
    });
  }
}
