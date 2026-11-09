import { lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createJsonLinesLogger,
  createTemporaryLogPath,
  LogPathIsFolderError,
} from "../../src/adapters/json-lines-logger/json-lines-logger.js";

const TIME = new Date("2026-11-02T10:00:00.000Z");
const OWNER_ONLY_FILE = 0o600;
const OWNER_ONLY_FOLDER = 0o700;
const PERMISSION_BITS = 0o777;
// Windows has no POSIX permission bits (Node reports 0o666), so the mode checks run elsewhere only.
const HAS_POSIX_MODES = process.platform !== "win32";

describe("JsonLinesLogger", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "migrate-log-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  async function readLines(path: string): Promise<unknown[]> {
    return (await readFile(path, "utf8"))
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
  }

  it("info and warn append one JSON object per line, creating the directory", async () => {
    const path = join(directory, "nested", "run.jsonl");
    const logger = createJsonLinesLogger({ path, now: () => TIME, isExclusive: false });

    logger.info("migration_started", { fileCount: 2 });
    logger.warn("migration_failed");

    expect(await readLines(path)).toEqual([
      { time: "2026-11-02T10:00:00.000Z", level: "info", event: "migration_started", fileCount: 2 },
      { time: "2026-11-02T10:00:00.000Z", level: "warn", event: "migration_failed" },
    ]);
  });

  it.skipIf(!HAS_POSIX_MODES)(
    "a logger that is not exclusive creates its file for the owner only",
    async () => {
      const path = join(directory, "nested", "run.jsonl");

      createJsonLinesLogger({ path, now: () => TIME, isExclusive: false }).info("started");

      expect((await stat(path)).mode & PERMISSION_BITS).toBe(OWNER_ONLY_FILE);
    },
  );

  it("a logger that is not exclusive fails on creation when its path is a folder", async () => {
    const path = join(directory, "logs");
    await mkdir(path);

    expect(() => createJsonLinesLogger({ path, now: () => TIME, isExclusive: false })).toThrow(
      LogPathIsFolderError,
    );
  });

  it("a logger that is not exclusive appends to an existing file", async () => {
    const path = join(directory, "run.jsonl");
    await writeFile(path, '{"earlier":true}\n');

    createJsonLinesLogger({ path, now: () => TIME, isExclusive: false }).info("again");

    expect(await readLines(path)).toEqual([
      { earlier: true },
      { time: "2026-11-02T10:00:00.000Z", level: "info", event: "again" },
    ]);
  });

  it("an exclusive logger refuses a path that exists, a link too, and leaves its target", async () => {
    const target = join(directory, "victim.txt");
    await writeFile(target, "victim");
    const path = join(directory, "run.jsonl");
    await symlink(target, path);

    expect(() => createJsonLinesLogger({ path, now: () => TIME, isExclusive: true })).toThrow(
      "EEXIST",
    );
    expect(await readFile(target, "utf8")).toBe("victim");
  });

  it.skipIf(!HAS_POSIX_MODES)(
    "an exclusive logger creates its file for the owner only",
    async () => {
      const path = join(directory, "run.jsonl");

      createJsonLinesLogger({ path, now: () => TIME, isExclusive: true }).info("started");

      expect((await lstat(path)).mode & PERMISSION_BITS).toBe(OWNER_ONLY_FILE);
      expect(await readLines(path)).toHaveLength(1);
    },
  );
});

describe("createTemporaryLogPath", () => {
  let parent: string;

  beforeEach(async () => {
    parent = await mkdtemp(join(tmpdir(), "migrate-tmp-"));
  });

  afterEach(async () => {
    await rm(parent, { recursive: true, force: true });
  });

  it("createTemporaryLogPath makes a new folder per run, named by the time", async () => {
    const first = createTemporaryLogPath(parent, TIME);
    const second = createTemporaryLogPath(parent, TIME);

    expect(dirname(first)).not.toBe(dirname(second));
    expect(dirname(dirname(first))).toBe(parent);
    expect(basename(dirname(first))).toMatch(/^openapi-typesafe-migrate-/);
    expect(basename(first)).toBe("2026-11-02T10-00-00.000Z.jsonl");
  });

  it.skipIf(!HAS_POSIX_MODES)(
    "createTemporaryLogPath makes its folder for the owner only",
    async () => {
      const path = createTemporaryLogPath(parent, TIME);

      expect((await stat(dirname(path))).mode & PERMISSION_BITS).toBe(OWNER_ONLY_FOLDER);
    },
  );
});
