import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJsonLinesLogger } from "../../src/adapters/json-lines-logger/json-lines-logger.js";

const TIME = new Date("2026-11-02T10:00:00.000Z");

describe("JsonLinesLogger", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "migrate-log-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("info and warn append one JSON object per line, creating the directory", async () => {
    const path = join(directory, "nested", "run.jsonl");
    const logger = createJsonLinesLogger({ path, now: () => TIME });

    logger.info("migration_started", { fileCount: 2 });
    logger.warn("migration_failed");

    const lines = (await readFile(path, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { time: "2026-11-02T10:00:00.000Z", level: "info", event: "migration_started", fileCount: 2 },
      { time: "2026-11-02T10:00:00.000Z", level: "warn", event: "migration_failed" },
    ]);
  });
});
