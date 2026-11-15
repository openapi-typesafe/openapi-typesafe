import { describe, expect, it } from "vitest";
import { HeldMessages } from "../../src/api/held-messages.js";
import type { DebugGroup, Logger } from "../../src/application/ports/logger.js";

/** The messages of a pointer pass that may be dropped, written only once it is kept. */

class CallLog implements Logger {
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

describe("HeldMessages", () => {
  it("writeTo writes every held message in its order with its arguments", () => {
    const held = new HeldMessages();
    const log = new CallLog();
    held.warn("w");
    held.debug("d", "ts", 3);
    held.error("e");

    held.writeTo(log);

    expect(log.calls).toEqual([
      ["warn", "w"],
      ["debug", "d", "ts", 3],
      ["error", "e"],
    ]);
  });

  it("holds messages until writeTo", () => {
    const held = new HeldMessages();
    const log = new CallLog();

    held.warn("w");

    expect(log.calls).toEqual([]);
  });
});
