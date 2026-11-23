import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GeneratorRun, GeneratorRunner } from "../application/ports.ts";
import type { RunMeasurement } from "../domain/benchmark.ts";

/** Enough output to show why a run failed; the rest is dropped to bound memory. */
const MAX_OUTPUT_LENGTH = 65_536;
const PROBE_PATH = fileURLToPath(new URL("peak-rss-probe.cjs", import.meta.url));
const OUTPUT_FILE_NAME = "output.ts";
const PEAK_RSS_FILE_NAME = "peak-rss.txt";

/** A generator run that did not finish with exit code 0; its timing would mean nothing. */
export class GeneratorRunError extends Error {
  override readonly name = "GeneratorRunError";
}

export interface NodeGeneratorRunnerOptions {
  /** A scratch directory for the generated file and the memory probe's result. */
  readonly workDir: string;
  readonly timeoutMs: number;
  /** A monotonic millisecond clock, injected so durations are testable. */
  readonly now?: () => number;
}

interface ChildOutcome {
  readonly exitCode: number | null;
  readonly output: string;
}

/** Runs `node <cli> <document> -o <file>` in a fresh process, with the memory probe preloaded. */
export class NodeGeneratorRunner implements GeneratorRunner {
  readonly #options: NodeGeneratorRunnerOptions;
  readonly #now: () => number;

  constructor(options: NodeGeneratorRunnerOptions) {
    this.#options = options;
    this.#now = options.now ?? (() => performance.now());
  }

  async run(run: GeneratorRun): Promise<RunMeasurement> {
    const peakRssFile = join(this.#options.workDir, PEAK_RSS_FILE_NAME);
    // The file of the previous run must not stand in for a run whose probe wrote nothing.
    await rm(peakRssFile, { force: true });
    const startedAt = this.#now();
    const { exitCode, output } = await this.#spawn(run, peakRssFile);
    const wallMs = this.#now() - startedAt;
    if (exitCode !== 0) {
      throw new GeneratorRunError(
        `${run.cliPath} failed on ${run.documentPath} (exit code ${exitCode}):\n${output}`,
      );
    }
    return { wallMs, peakRssBytes: await this.#readPeakRss(run, peakRssFile) };
  }

  /** The probe's number; a process that exits without its "exit" event leaves no file. */
  async #readPeakRss(run: GeneratorRun, peakRssFile: string): Promise<number> {
    try {
      return Number(await readFile(peakRssFile, "utf8"));
    } catch (error) {
      throw new GeneratorRunError(`${run.cliPath} exited without reporting its peak memory`, {
        cause: error,
      });
    }
  }

  #spawn(run: GeneratorRun, peakRssFile: string): Promise<ChildOutcome> {
    const outputFile = join(this.#options.workDir, OUTPUT_FILE_NAME);
    const child = spawn(
      process.execPath,
      ["--require", PROBE_PATH, run.cliPath, run.documentPath, "-o", outputFile],
      {
        env: { ...process.env, BENCH_PEAK_RSS_FILE: peakRssFile },
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
      child.on("close", (exitCode) => resolve({ exitCode, output }));
    });
  }
}
