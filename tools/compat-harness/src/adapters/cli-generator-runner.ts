import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { GeneratorRun, GeneratorRunner, GeneratorRunOutcome } from "../application/ports.ts";

/**
 * Enough stderr for an error message and the top of a stack trace; the rest is dropped to bound
 * memory.
 */
const MAX_STDERR_LENGTH = 16_384;

/**
 * Runs a generator CLI (`node <cliPath> <schema> -o <output> ...flags`) in a child process. The
 * process is killed when it runs longer than the run's timeout.
 */
export class CliGeneratorRunner implements GeneratorRunner {
  readonly #cliPath: string;
  readonly #now: () => number;

  /** `now` is a monotonic millisecond clock, injected so durations are testable. */
  constructor(cliPath: string, now: () => number = () => performance.now()) {
    this.#cliPath = cliPath;
    this.#now = now;
  }

  async run(run: GeneratorRun): Promise<GeneratorRunOutcome> {
    await mkdir(dirname(run.outputPath), { recursive: true });
    const startedAt = this.#now();
    const args = [this.#cliPath, run.schemaPath, "--output", run.outputPath, ...run.flags];
    const child = spawn(process.execPath, args, {
      // Run next to the schema, so a `redocly.yaml` of the caller's directory cannot change the
      // output.
      cwd: dirname(run.schemaPath),
      stdio: ["ignore", "ignore", "pipe"],
      signal: AbortSignal.timeout(run.timeoutMs),
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(0, MAX_STDERR_LENGTH);
    });
    return new Promise((resolve) => {
      let isTimedOut = false;
      // An aborted spawn emits "error" with an AbortError and then "close"; the outcome is built on
      // "close".
      child.on("error", (error) => {
        isTimedOut ||= error.name === "AbortError";
        if (!isTimedOut) {
          stderr += error.message;
        }
      });
      child.on("close", (exitCode) => {
        resolve({ exitCode, isTimedOut, stderr, durationMs: Math.round(this.#now() - startedAt) });
      });
    });
  }
}
