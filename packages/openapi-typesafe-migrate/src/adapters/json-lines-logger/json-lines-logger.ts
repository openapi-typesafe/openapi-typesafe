import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Logger } from "../../application/ports.js";

/** The log file and the clock of the timestamps. */
export interface JsonLinesLoggerOptions {
  readonly path: string;
  readonly now: () => Date;
}

type Level = "info" | "warn";

/**
 * The Logger port as a JSON Lines file: one object per event with a UTC timestamp, the level and
 * the event's fields. Lines are appended synchronously, so the log is complete when the command
 * fails half way.
 */
class JsonLinesLogger implements Logger {
  readonly #options: JsonLinesLoggerOptions;

  constructor(options: JsonLinesLoggerOptions) {
    this.#options = options;
    mkdirSync(dirname(options.path), { recursive: true });
  }

  info(event: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.#append("info", event, fields);
  }

  warn(event: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.#append("warn", event, fields);
  }

  #append(level: Level, event: string, fields: Readonly<Record<string, unknown>>): void {
    const time = this.#options.now().toISOString();
    appendFileSync(this.#options.path, `${JSON.stringify({ time, level, event, ...fields })}\n`);
  }
}

/** A logger that appends to the JSON Lines file at `options.path`, creating its directory. */
export function createJsonLinesLogger(options: JsonLinesLoggerOptions): Logger {
  return new JsonLinesLogger(options);
}
