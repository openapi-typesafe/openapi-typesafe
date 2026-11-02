import type { Logger } from "../../src/application/ports.js";

export interface LoggedEvent {
  readonly level: "info" | "warn";
  readonly event: string;
  readonly fields: Readonly<Record<string, unknown>>;
}

/** A logger that keeps the events, for assertions. */
export class RecordingLogger implements Logger {
  readonly events: LoggedEvent[] = [];

  info(event: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.events.push({ level: "info", event, fields });
  }

  warn(event: string, fields: Readonly<Record<string, unknown>> = {}): void {
    this.events.push({ level: "warn", event, fields });
  }
}
