import { appendFileSync, closeSync, fstatSync, mkdirSync, mkdtempSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Logger } from "../../application/ports.js";

/** The log file, the clock of the timestamps, and whether the file must be new. */
export interface JsonLinesLoggerOptions {
  readonly path: string;
  readonly now: () => Date;
  /**
   * The file must not exist yet: it is created with `O_CREAT | O_EXCL`, which also refuses a
   * link at the path instead of following it. Used for the default log in the temporary folder.
   * Without it, an existing file (the user's `--log`) gets the new lines appended.
   * Either way the file is opened when the logger is created, so a path that cannot be a log
   * file (a folder, a read-only place) fails before the migration starts.
   */
  readonly isExclusive: boolean;
}

type Level = "info" | "warn";

/** The log can name files and changes of a private project, so only its owner can read it. */
const LOG_FILE_MODE = 0o600;
const TEMPORARY_FOLDER_PREFIX = "openapi-typesafe-migrate-";
const LOG_EXTENSION = ".jsonl";
const TIME_SEPARATOR = ":";
/** `:` is not allowed in Windows file names. */
const FILE_NAME_TIME_SEPARATOR = "-";

/** The path names a folder, so lines cannot be appended to it. */
export class LogPathIsFolderError extends Error {
  override readonly name = "LogPathIsFolderError";

  constructor(path: string) {
    super(`${path} is a folder; --log takes a file path`);
  }
}

const EXCLUSIVE_CREATE_FLAG = "wx";
const APPEND_FLAG = "a";
const IS_A_DIRECTORY_CODE = "EISDIR";

/**
 * Create or open the log file once, to fail early. POSIX refuses to open a folder for writing
 * (EISDIR), but Windows opens it and accepts empty writes, so the opened file is also checked.
 */
function openLogFile(path: string, isExclusive: boolean): void {
  let descriptor: number;
  try {
    descriptor = openSync(path, isExclusive ? EXCLUSIVE_CREATE_FLAG : APPEND_FLAG, LOG_FILE_MODE);
  } catch (error) {
    throw isDirectoryError(error) ? new LogPathIsFolderError(path) : error;
  }
  try {
    if (fstatSync(descriptor).isDirectory()) {
      throw new LogPathIsFolderError(path);
    }
  } finally {
    closeSync(descriptor);
  }
}

const isDirectoryError = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === IS_A_DIRECTORY_CODE;

/**
 * The Logger port as a JSON Lines file: one object per event with a UTC timestamp, the level and
 * the event's fields. Lines are appended synchronously, so the log is complete when the command
 * fails half way.
 */
class JsonLinesLogger implements Logger {
  readonly #options: JsonLinesLoggerOptions;

  constructor(options: JsonLinesLoggerOptions) {
    this.#options = options;
    if (!options.isExclusive) {
      mkdirSync(dirname(options.path), { recursive: true });
    }
    openLogFile(options.path, options.isExclusive);
  }

  info(event: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.#append("info", event, fields);
  }

  warn(event: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.#append("warn", event, fields);
  }

  #append(level: Level, event: string, fields: Readonly<Record<string, unknown>>): void {
    const time = this.#options.now().toISOString();
    const line = `${JSON.stringify({ time, level, event, ...fields })}\n`;
    appendFileSync(this.#options.path, line, { mode: LOG_FILE_MODE });
  }
}

/** A logger that appends to the JSON Lines file at `options.path`, creating its directory. */
export function createJsonLinesLogger(options: JsonLinesLoggerOptions): Logger {
  return new JsonLinesLogger(options);
}

/**
 * The path of a run's log in a new folder under `parent` (the system temporary folder), named by
 * the run's UTC start time. `mkdtemp` gives the folder a name no other user can guess and mode
 * 0700, so on a shared host nobody else can plant a file or a link in it.
 */
export function createTemporaryLogPath(parent: string, startTime: Date): string {
  const folder = mkdtempSync(join(parent, TEMPORARY_FOLDER_PREFIX));
  const name = startTime.toISOString().replaceAll(TIME_SEPARATOR, FILE_NAME_TIME_SEPARATOR);
  return join(folder, `${name}${LOG_EXTENSION}`);
}
