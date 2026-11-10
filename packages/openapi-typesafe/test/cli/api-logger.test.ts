import { describe, expect, it } from "vitest";
import type { DebugGroup, Logger } from "../../src/application/ports/logger.js";
import { apiLogger } from "../../src/cli/api-logger.js";

/** Records every call with all its arguments, so a dropped debug group or duration shows. */
class ArgumentsLogger implements Logger {
  readonly calls: unknown[][] = [];

  debug(message: string, group?: DebugGroup, durationMs?: number): void {
    this.calls.push(["debug", message, group, durationMs]);
  }

  warn(message: string): void {
    this.calls.push(["warn", message]);
  }

  error(message: string): void {
    this.calls.push(["error", message]);
  }
}

describe("apiLogger", () => {
  it("apiLogger prefixes every line with the API name and keeps the debug group and time", () => {
    const logger = new ArgumentsLogger();
    const named = apiLogger(logger, "pets");

    named.debug("loaded", "redoc", 12);
    named.warn("a warning");
    named.error("an error");

    expect(logger.calls).toEqual([
      ["debug", "API pets: loaded", "redoc", 12],
      ["warn", "API pets: a warning"],
      ["error", "API pets: an error"],
    ]);
  });
});
