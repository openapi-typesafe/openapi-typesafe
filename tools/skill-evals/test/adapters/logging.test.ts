import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonLinesFileLogger } from "../../src/adapters/json-lines-file-logger.ts";
import { SystemClock } from "../../src/adapters/system-clock.ts";
import { SteppingClock } from "../fakes/stepping-clock.ts";

const NOW = "2026-11-02T12:00:00.000Z";

describe("JsonLinesFileLogger", () => {
  it("info and error append one JSON line each with time, level, event and fields", () => {
    const path = join(mkdtempSync(join(tmpdir(), "skill-evals-")), "logs", "run.jsonl");
    const logger = new JsonLinesFileLogger(path, new SteppingClock(NOW, 0));

    logger.info("task_started", { task: "03-get-pet-name" });
    logger.error("task_finished");

    const lines = readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(logger.path).toBe(path);
    expect(lines).toEqual([
      { time: NOW, level: "info", event: "task_started", task: "03-get-pet-name" },
      { time: NOW, level: "error", event: "task_finished" },
    ]);
  });
});

describe("SystemClock", () => {
  it("now returns the current time", () => {
    const before = Date.now();

    expect(new SystemClock().now().getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("SteppingClock", () => {
  it("rejects a timestamp without a UTC offset", () => {
    expect(() => new SteppingClock("2026-11-02T12:00:00", 1)).toThrow(/UTC/);
  });
});
