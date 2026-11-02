/**
 * Ports: every effect the harness needs from the outside world. Use cases depend only on these
 * interfaces; Node implementations live in `adapters/`, in-memory fakes in `test/fakes/`.
 */

/** Response of an HTTP GET. Non-2xx responses are returned, not thrown. */
export interface HttpResponse {
  readonly status: number;
  readonly body: string;
}

export interface HttpClient {
  /** Fetch a URL as text. Rejects on network errors and timeouts. */
  getText(url: string): Promise<HttpResponse>;
}

/** File access relative to one root directory. Paths use forward slashes. */
export interface FileStore {
  readText(path: string): Promise<string | undefined>;
  writeText(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Delete a file; deleting a missing file is not an error. */
  remove(path: string): Promise<void>;
  /** Absolute path for tools that need a real file (the generator CLI, the TypeScript compiler). */
  resolve(path: string): string;
}

export interface Hasher {
  sha256(content: string): string;
}

/** Structured log fields; values must be JSON-serializable. */
export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export interface Clock {
  now(): Date;
}

/** Waits for a number of milliseconds; injected so retry tests do not sleep. */
export type Sleep = (milliseconds: number) => Promise<void>;

/** One invocation of a generator CLI. */
export interface GeneratorRun {
  readonly schemaPath: string;
  readonly outputPath: string;
  readonly flags: readonly string[];
  readonly timeoutMs: number;
}

export interface GeneratorRunOutcome {
  readonly exitCode: number | null;
  readonly isTimedOut: boolean;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface GeneratorRunner {
  run(run: GeneratorRun): Promise<GeneratorRunOutcome>;
}

/** Checks that two generated files export identical types (ENGINEERING_PLAN 2.4). */
export interface TypeIdentityChecker {
  /**
   * Return the names of exported types that differ; empty when every exported type is identical.
   */
  findDifferentTypes(goldenPath: string, candidatePath: string): Promise<readonly string[]>;
}
