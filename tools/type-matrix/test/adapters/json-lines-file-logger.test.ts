import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonLinesFileLogger } from "../../src/adapters/json-lines-file-logger.ts";
import { SystemClock } from "../../src/adapters/system-clock.ts";
import { FixedClock } from "../fakes/fixed-clock.ts";

const NOW = "2026-11-02T12:00:00.000Z";

describe("JsonLinesFileLogger", () => {
  it("info and error append one JSON line each with time, level, event and fields", () => {
    const path = join(mkdtempSync(join(tmpdir(), "type-matrix-")), "logs", "run.jsonl");
    const logger = new JsonLinesFileLogger(path, new FixedClock(NOW));

    logger.info("check_passed", { typescript: "5.4" });
    logger.error("check_failed");

    const lines = readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(logger.path).toBe(path);
    expect(lines).toEqual([
      { time: NOW, level: "info", event: "check_passed", typescript: "5.4" },
      { time: NOW, level: "error", event: "check_failed" },
    ]);
  });
});

describe("SystemClock", () => {
  it("now returns the current time", () => {
    const before = Date.now();

    const now = new SystemClock().now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
  });
});

describe("FixedClock", () => {
  it("FixedClock rejects a timestamp without a UTC offset", () => {
    expect(() => new FixedClock("2026-11-02T12:00:00")).toThrow(/UTC/);
  });
});
