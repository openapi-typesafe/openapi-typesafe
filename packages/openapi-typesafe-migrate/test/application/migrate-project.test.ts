import { describe, expect, it } from "vitest";
import { migrateProject } from "../../src/application/migrate-project.js";
import { InMemoryProjectFiles } from "../fakes/in-memory-project-files.js";
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

function setUp(files: Readonly<Record<string, string>> = PROJECT) {
  return {
    files: new InMemoryProjectFiles(files),
    rewriter: new StubCallbackRewriter(),
    scanner: new QuotedStringScanner(),
    logger: new RecordingLogger(),
  };
}

describe("migrateProject", () => {
  it("migrateProject reports every changed file in path order without writing on a dry run", async () => {
    const dependencies = setUp();

    const reports = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(reports.map((report) => report.path)).toEqual([
      "package.json",
      "pnpm-workspace.yaml",
      "scripts/gen.sh",
      "src/api.ts",
    ]);
    expect(reports.every((report) => report.isChanged)).toBe(true);
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

    const reports = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(reports).toEqual([
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
});
