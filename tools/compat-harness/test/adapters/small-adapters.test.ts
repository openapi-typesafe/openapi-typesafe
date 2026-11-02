import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonLinesFileLogger } from "../../src/adapters/json-lines-file-logger.ts";
import { NodeHasher } from "../../src/adapters/node-hasher.ts";
import { SystemClock } from "../../src/adapters/system-clock.ts";
import { FixedClock } from "../fakes/fixed-clock.ts";
import { useTemporaryDirectory } from "./temporary-directory.ts";

const createDirectory = useTemporaryDirectory();

describe("NodeHasher", () => {
  it("sha256 returns the lowercase hex digest of the UTF-8 bytes", () => {
    expect(new NodeHasher().sha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("SystemClock", () => {
  it("now returns the current time", () => {
    const before = Date.now();

    const now = new SystemClock().now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe("JsonLinesFileLogger", () => {
  it("writes one JSON record per line with time, level, event and fields", async () => {
    const path = join(await createDirectory(), "nested/run.jsonl");
    const logger = new JsonLinesFileLogger(path, new FixedClock("2026-11-02T00:00:00.000Z"));

    logger.info("started", { count: 1 });
    logger.warn("slow");
    logger.error("failed", { reason: "x" });

    const lines = (await readFile(path, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(logger.path).toBe(path);
    expect(lines).toEqual([
      { time: "2026-11-02T00:00:00.000Z", level: "info", event: "started", count: 1 },
      { time: "2026-11-02T00:00:00.000Z", level: "warn", event: "slow" },
      { time: "2026-11-02T00:00:00.000Z", level: "error", event: "failed", reason: "x" },
    ]);
  });
});
