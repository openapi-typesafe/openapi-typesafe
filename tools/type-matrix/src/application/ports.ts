/**
 * Ports: every effect the type matrix needs from the outside world. The use case depends only on
 * these interfaces; Node implementations live in `adapters/`, in-memory fakes in `test/fakes/`.
 */

/** Structured log fields; values must be JSON-serializable. */
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export interface Clock {
  now(): Date;
}

/** One type-check: a compiler package on a tsconfig. */
export interface CompilerRun {
  readonly packageName: string;
  readonly tsconfig: string;
}

export interface CompilerOutcome {
  readonly exitCode: number | null;
  /** Standard output and standard error together: `tsc` prints its errors on stdout. */
  readonly output: string;
  readonly durationMs: number;
}

export interface CompilerRunner {
  run(run: CompilerRun): Promise<CompilerOutcome>;
}
