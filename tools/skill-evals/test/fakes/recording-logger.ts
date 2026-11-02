import type { LogFields, Logger } from "../../src/application/ports.ts";

export interface LogRecord {
  readonly level: "info" | "error";
  readonly event: string;
  readonly fields: LogFields;
}

/** Keeps every log record in memory, in order. */
export class RecordingLogger implements Logger {
  readonly records: LogRecord[] = [];

  info(event: string, fields: LogFields = {}): void {
    this.records.push({ level: "info", event, fields });
  }

  error(event: string, fields: LogFields = {}): void {
    this.records.push({ level: "error", event, fields });
  }
}
