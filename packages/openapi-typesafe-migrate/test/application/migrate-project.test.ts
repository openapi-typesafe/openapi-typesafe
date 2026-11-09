import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateProject } from "../../src/application/migrate-project.js";
import type { SkippedFile } from "../../src/application/ports.js";
import { type FileProblems, InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { RecordingLogger } from "../fakes/recording-logger.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const PROJECT = {
  "package.json": `${JSON.stringify({ devDependencies: { "openapi-typescript": "^7.13.0" } })}\n`,
  "pnpm-workspace.yaml": "catalog:\n  openapi-fetch: ^0.13.1\n",
  "src/api.ts": 'import createClient from "openapi-fetch";\n',
  "scripts/gen.sh": "openapi-typescript a.yaml -o b.ts\n",
  "README.md": "Uses openapi-fetch.\n",
  "src/plain.ts": "export const x = 1;\n",
};

function setUp(
  files: Readonly<Record<string, string>> = PROJECT,
  skipped: SkippedFile[] = [],
  problems: FileProblems = {},
) {
  return {
    files: new InMemoryProjectFiles(files, skipped, problems),
    rewriter: new StubCallbackRewriter(),
    scanner: new QuotedStringScanner(),
    readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
    logger: new RecordingLogger(),
  };
}

describe("migrateProject", () => {
  it("migrateProject reports every changed file in path order without writing on a dry run", async () => {
    const dependencies = setUp();

    const { files } = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(files.map((report) => report.path)).toEqual([
      "package.json",
      "pnpm-workspace.yaml",
      "scripts/gen.sh",
      "src/api.ts",
    ]);
    expect(files.every((report) => report.isChanged)).toBe(true);
    expect(dependencies.files.written).toEqual([]);
  });

  it("migrateProject writes the changed files with isWrite", async () => {
    const dependencies = setUp();

    await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(dependencies.files.written.sort()).toEqual([
      "package.json",
      "pnpm-workspace.yaml",
      "scripts/gen.sh",
      "src/api.ts",
    ]);
    expect(dependencies.files.files.get("src/api.ts")).toBe(
      'import createClient from "openapi-typesafe-fetch";\n',
    );
  });

  it("migrateProject gives sources to the rewriter after the specifier rename", async () => {
    const dependencies = setUp();

    await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(dependencies.rewriter.calls).toEqual([
      { path: "src/api.ts", text: 'import createClient from "openapi-typesafe-fetch";\n' },
      { path: "src/plain.ts", text: "export const x = 1;\n" },
    ]);
  });

  it("migrateProject reports a file with manual steps only", async () => {
    const dependencies = setUp({ "ci.yml": "run: npx openapi-typescript@7 a.yaml\n" });

    const { files } = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(files).toEqual([
      {
        path: "ci.yml",
        isChanged: false,
        changes: [],
        manualSteps: [{ kind: "versioned-command", location: "ci.yml:1" }],
      },
    ]);
    expect(dependencies.files.written).toEqual([]);
  });

  it("migrateProject logs the start, each migrated file and the end", async () => {
    const dependencies = setUp({ "src/api.ts": 'import "openapi-fetch";\n', "src/b.ts": "" });

    await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(dependencies.logger.events.map((event) => event.event)).toEqual([
      "migration_started",
      "file_migrated",
      "migration_finished",
    ]);
    expect(dependencies.logger.events[0]?.fields).toEqual({
      fileCount: 2,
      version: "1.0.0",
      isWrite: false,
    });
  });

  it("migrateProject gives the skipped paths of the listing and logs their count", async () => {
    const skipped: SkippedFile[] = [
      { path: "vendor/../../x.ts", reason: { kind: "outside-root" } },
    ];
    const dependencies = setUp({ "src/b.ts": "" }, skipped);

    const migration = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(migration).toEqual({ files: [], skipped, write: { kind: "written", paths: [] } });
    expect(dependencies.logger.events.at(-1)?.fields).toEqual({
      changedFiles: 0,
      skippedFiles: 1,
      write: "written",
    });
  });

  it("migrateProject skips a file it cannot read, reports it and migrates the others", async () => {
    const unreadable = { "src/api.ts": { kind: "not-utf-8" } } as const;
    const dependencies = setUp(PROJECT, [], { unreadable });

    const migration = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(migration.skipped).toEqual([{ path: "src/api.ts", reason: { kind: "not-utf-8" } }]);
    expect(dependencies.files.written).toEqual([
      "package.json",
      "pnpm-workspace.yaml",
      "scripts/gen.sh",
    ]);
    expect(dependencies.logger.events).toContainEqual({
      level: "warn",
      event: "file_skipped",
      fields: { path: "src/api.ts", reason: { kind: "not-utf-8" } },
    });
  });

  it("migrateProject reads every file before it writes the first one", async () => {
    const dependencies = setUp();
    const reads: string[] = [];
    const files = dependencies.files;
    const tracking = {
      listFiles: () => files.listFiles(),
      read: (path: string) => {
        reads.push(`read ${path}`);
        return files.read(path);
      },
      write: (path: string, text: string) => {
        reads.push(`write ${path}`);
        return files.write(path, text);
      },
    };

    await migrateProject({ ...dependencies, files: tracking }, { version: "1.0.0", isWrite: true });

    const firstWrite = reads.findIndex((entry) => entry.startsWith("write"));
    expect(reads.slice(firstWrite).every((entry) => entry.startsWith("write"))).toBe(true);
  });

  it("migrateProject stops at a write that fails and names what was and was not written", async () => {
    const unwritable = { "scripts/gen.sh": { kind: "io-error", code: "EACCES" } } as const;
    const dependencies = setUp(PROJECT, [], { unwritable });

    const migration = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(migration.write).toEqual({
      kind: "failed",
      written: ["package.json", "pnpm-workspace.yaml"],
      failed: { path: "scripts/gen.sh", reason: { kind: "io-error", code: "EACCES" } },
      notWritten: ["src/api.ts"],
    });
    expect(dependencies.files.written).toEqual(["package.json", "pnpm-workspace.yaml"]);
    expect(dependencies.logger.events.at(-1)?.fields).toMatchObject({ write: "failed" });
  });

  it("migrateProject writes nothing on a dry run and says so", async () => {
    const dependencies = setUp();

    const migration = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(migration.write).toEqual({ kind: "dry-run" });
  });
});
