import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Clock, LogFields, Logger } from "../application/ports.ts";

const LogLevel = { Info: "info", Warn: "warn", Error: "error" } as const;
type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Logger that appends one JSON object per line to a file, with a UTC timestamp. Writes are
 * synchronous so the log stays complete and ordered even when the process exits on an error.
 */
export class JsonLinesFileLogger implements Logger {
  readonly #path: string;
  readonly #clock: Clock;

  constructor(path: string, clock: Clock) {
    this.#path = path;
    this.#clock = clock;
    mkdirSync(dirname(path), { recursive: true });
  }

  get path(): string {
    return this.#path;
  }

  info(event: string, fields?: LogFields): void {
    this.#write(LogLevel.Info, event, fields);
  }

  warn(event: string, fields?: LogFields): void {
    this.#write(LogLevel.Warn, event, fields);
  }

  error(event: string, fields?: LogFields): void {
    this.#write(LogLevel.Error, event, fields);
  }

  #write(level: LogLevel, event: string, fields: LogFields = {}): void {
    const record = { time: this.#clock.now().toISOString(), level, event, ...fields };
    appendFileSync(this.#path, `${JSON.stringify(record)}\n`, "utf8");
  }
}
