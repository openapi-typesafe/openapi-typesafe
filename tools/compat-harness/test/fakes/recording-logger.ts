import type { LogFields, Logger } from "../../src/application/ports.ts";

export interface LogRecord {
  readonly level: "info" | "warn" | "error";
  readonly event: string;
  readonly fields: LogFields;
}

/** Logger that keeps records in memory for assertions. */
export class RecordingLogger implements Logger {
  readonly records: LogRecord[] = [];

  info(event: string, fields: LogFields = {}): void {
    this.records.push({ level: "info", event, fields });
  }

  warn(event: string, fields: LogFields = {}): void {
    this.records.push({ level: "warn", event, fields });
  }

  error(event: string, fields: LogFields = {}): void {
    this.records.push({ level: "error", event, fields });
  }
}
