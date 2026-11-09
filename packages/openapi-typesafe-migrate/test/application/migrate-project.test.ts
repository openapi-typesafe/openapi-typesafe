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

describe("migrateProject and catalogs", () => {
  const manifestOf = (dependencies: Readonly<Record<string, string>>) =>
    `${JSON.stringify({ dependencies }, undefined, 2)}\n`;

  async function migrated(files: Readonly<Record<string, string>>) {
    const dependencies = setUp(files);
    const migration = await migrateProject(dependencies, { version: "1.0.0", isWrite: true });
    const steps = migration.files.flatMap((file) => file.manualSteps.map((step) => step.kind));
    return { files: dependencies.files.files, steps };
  }

  it("migrateProject keeps a catalog entry that a colliding dependency still uses", async () => {
    const project = {
      "package.json": manifestOf({
        "openapi-fetch": "catalog:",
        "openapi-typesafe-fetch": "^1.0.0-rc.2",
      }),
      "pnpm-workspace.yaml": "packages:\n  - .\ncatalog:\n  openapi-fetch: ^0.13.0\n",
    };

    const { files, steps } = await migrated(project);

    expect(files.get("pnpm-workspace.yaml")).toBe(project["pnpm-workspace.yaml"]);
    expect(files.get("package.json")).toBe(project["package.json"]);
    expect(steps).toEqual(expect.arrayContaining(["name-collision", "catalog-entry-in-use"]));
  });

  it("migrateProject keeps a dependency on a catalog entry the tool does not edit", async () => {
    const project = {
      "package.json": manifestOf({
        "openapi-fetch": "catalog:",
        "openapi-typescript": "catalog:",
        "openapi-react-query": "catalog:",
        "openapi-typescript-helpers": "catalog:x",
      }),
      "pnpm-workspace.yaml": [
        "x: &v ^0.13.0",
        "catalog:",
        "  openapi-fetch: *v",
        "  openapi-typescript: { }",
        "  openapi-react-query: ^0.5.0",
        "catalogs:",
        "  x: { openapi-typescript-helpers: ^0.0.15 }",
        "",
      ].join("\n"),
    };

    const { files, steps } = await migrated(project);

    expect(JSON.parse(files.get("package.json") ?? "").dependencies).toEqual({
      "openapi-fetch": "catalog:",
      "openapi-typescript": "catalog:",
      "openapi-typesafe-react-query": "catalog:",
      "openapi-typesafe-helpers": "catalog:x",
    });
    expect(files.get("pnpm-workspace.yaml")).toContain("  openapi-typesafe-react-query: ^1.0.0");
    expect(steps.filter((kind) => kind === "catalog-reference-kept")).toHaveLength(2);
  });

  it("migrateProject plans catalogs from package.yaml and leaves out files it cannot read", async () => {
    const files = {
      "package.yaml": "dependencies:\n  openapi-fetch: 'catalog:'\n  openapi-typesafe-fetch: ^1\n",
      "pnpm-workspace.yaml": "catalog:\n  openapi-fetch: ^0.13.0\n",
      ".yarnrc.yml": "catalog: [openapi-fetch\n",
      "apps/a/package.json": '{ "dependencies": { "openapi-fetch": "catalog:" } }\n',
    };
    const unreadable = { "apps/a/package.json": { kind: "io-error", code: "EACCES" } } as const;
    const dependencies = setUp(files, [], { unreadable });

    await migrateProject(dependencies, { version: "1.0.0", isWrite: true });

    expect(dependencies.files.files.get("pnpm-workspace.yaml")).toBe(files["pnpm-workspace.yaml"]);
  });
});

describe("migrateProject and undeclared imports", () => {
  const HELPERS_IMPORT = 'import type { FilterKeys } from "openapi-typescript-helpers";\n';
  const stepKinds = (reports: readonly { manualSteps: readonly { kind: string }[] }[]) =>
    reports.flatMap((report) => report.manualSteps.map((step) => step.kind));

  it("migrateProject reports a helpers import that the package only got through openapi-fetch", async () => {
    const files = {
      "package.json": '{ "dependencies": { "openapi-fetch": "^0.13.0" } }\n',
      "src/a.ts": HELPERS_IMPORT,
    };
    const dependencies = setUp(files);

    const result = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    const source = result.files.find((report) => report.path === "src/a.ts");
    expect(source?.manualSteps).toEqual([
      {
        kind: "package-not-declared",
        line: 1,
        name: "openapi-typesafe-helpers",
        installers: ["openapi-fetch", "openapi-react-query"],
      },
    ]);
  });

  it("migrateProject reads a manifest that names only the new helpers package", async () => {
    const files = {
      "package.json": '{ "dependencies": { "openapi-typesafe-helpers": "^1.0.0" } }\n',
      "src/a.ts": HELPERS_IMPORT,
    };
    const dependencies = setUp(files);

    const result = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(stepKinds(result.files)).toEqual([]);
  });

  it("migrateProject does not report an import in a package whose manifest it cannot read", async () => {
    const files = { "package.json": '{ "dependencies": {} }\n', "src/a.ts": HELPERS_IMPORT };
    const unreadable = { "package.json": { kind: "io-error", code: "EACCES" } } as const;
    const dependencies = setUp(files, [], { unreadable });

    const result = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(stepKinds(result.files)).toEqual([]);
  });

  it("migrateProject does not report an import in a package whose manifest it cannot parse", async () => {
    const files = {
      "package.json": '{ "dependencies": { "openapi-typescript-helpers": \n',
      "src/a.ts": HELPERS_IMPORT,
    };
    const dependencies = setUp(files);

    const result = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(stepKinds(result.files)).toEqual(["config-unreadable"]);
  });

  it("migrateProject takes the imports of a Deno import map as declared", async () => {
    const files = {
      "deno.json":
        '{ "imports": { "openapi-typescript-helpers": "npm:openapi-typescript-helpers@^0.1" } }\n',
      "package.json": '{ "scripts": { "fmt": "deno fmt" } }\n',
      "main.ts": HELPERS_IMPORT,
    };
    const dependencies = setUp(files);

    const result = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(stepKinds(result.files)).toEqual([]);
  });

  it("migrateProject reports an import that an earlier run renamed", async () => {
    const files = {
      "package.json": '{ "dependencies": { "openapi-typesafe-fetch": "^1.0.0" } }\n',
      "src/a.ts": 'import type { FilterKeys } from "openapi-typesafe-helpers";\n',
    };
    const dependencies = setUp(files);

    const result = await migrateProject(dependencies, { version: "1.0.0", isWrite: false });

    expect(stepKinds(result.files)).toEqual(["package-not-declared"]);
  });
});
