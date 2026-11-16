import type { DebugGroup, Logger } from "../application/ports/logger.js";

/**
 * The messages of a pass whose output may be dropped: they are held, and written to the run's
 * logger only once the pass is kept, so a pass run again does not repeat them.
 */
export class HeldMessages implements Logger {
  private readonly held: ((logger: Logger) => void)[] = [];

  debug(message: string, group?: DebugGroup, durationMs?: number): void {
    this.held.push((logger) => logger.debug(message, group, durationMs));
  }

  warn(message: string): void {
    this.held.push((logger) => logger.warn(message));
  }

  error(message: string): void {
    this.held.push((logger) => logger.error(message));
  }

  /** Writes the held messages to `logger`, in their order. */
  writeTo(logger: Logger): void {
    for (const write of this.held) {
      write(logger);
    }
  }
}
