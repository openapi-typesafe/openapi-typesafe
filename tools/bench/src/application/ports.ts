/**
 * Ports: every effect the benchmark needs from the outside world. The use case depends only on
 * these interfaces; Node implementations live in `adapters/`, in-memory fakes in `test/fakes/`.
 */
import type { RunMeasurement } from "../domain/benchmark.ts";

/** One generator CLI run on one document. */
export interface GeneratorRun {
  readonly cliPath: string;
  readonly documentPath: string;
}

export interface GeneratorRunner {
  /** Runs the CLI to completion; rejects when it fails, since a failed run measures nothing. */
  run(run: GeneratorRun): Promise<RunMeasurement>;
}

export interface DocumentFiles {
  /** The size of a document in bytes; rejects when the document is missing. */
  byteLength(path: string): Promise<number>;
}

/** One finished CLI run, e.g. `Stripe / openapi-typesafe 1.0.0`, `run 2/5`, 1250 ms. */
export interface RunEvent {
  readonly label: string;
  readonly run: string;
  readonly wallMs: number;
}

/** Progress for the terminal; a long benchmark that prints nothing looks hung. */
export interface ProgressReporter {
  runFinished(event: RunEvent): void;
}
