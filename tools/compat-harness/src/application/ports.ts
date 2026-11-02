import type { SwitchedPackageSpecs } from "../domain/package-switch.ts";

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

/** One command run in a child process without a shell; `command[0]` is the executable. */
export interface CommandRun {
  /** Absolute working directory. */
  readonly cwd: string;
  readonly command: readonly string[];
  readonly timeoutMs: number;
  /** Absolute path of a file that receives the full output; parent directories are created. */
  readonly logPath?: string;
}

export interface CommandOutcome {
  /** Null when the process was killed (timeout or signal). */
  readonly exitCode: number | null;
  readonly isTimedOut: boolean;
  /** The end of stdout and stderr together, where tools print their errors. */
  readonly outputTail: string;
  readonly durationMs: number;
}

export interface CommandRunner {
  run(run: CommandRun): Promise<CommandOutcome>;
}

/** Removes directory trees, for example a stale checkout before a new run. */
export interface DirectoryEraser {
  /** Delete a directory with its content; a missing directory is not an error. */
  erase(absolutePath: string): Promise<void>;
}

export interface ProjectSwitchSummary {
  readonly changedFileCount: number;
  readonly replacementCount: number;
}

/**
 * Rewrites a checked-out project for the two runs of ENGINEERING_PLAN 8.4: by package name only,
 * or with the migration tool of 10.1 (`--switch migrate`).
 */
export interface ProjectSwitcher {
  /** Switch to openapi-typesafe by package name only (the candidate run). */
  switchProject(projectRoot: string, specs: SwitchedPackageSpecs): Promise<ProjectSwitchSummary>;
  /** Pin the original packages to the upstream releases the fork starts from (the baseline run). */
  pinUpstreamVersions(projectRoot: string): Promise<ProjectSwitchSummary>;
}
