import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { MigrationToolProjectSwitcher } from "../../src/adapters/migration-tool-project-switcher.ts";
import type { CommandOutcome, CommandRun, CommandRunner } from "../../src/application/ports.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import type { SwitchedPackageSpecs } from "../../src/domain/package-switch.ts";
import { FakeProjectSwitcher } from "../fakes/fake-project-switcher.ts";
import { useTemporaryDirectory } from "./temporary-directory.ts";

const createDirectory = useTemporaryDirectory();

const SPECS: SwitchedPackageSpecs = {
  "openapi-typesafe": "file:/t/a.tgz",
  "openapi-typesafe-fetch": "file:/t/b.tgz",
  "openapi-typesafe-react-query": "file:/t/c.tgz",
  "openapi-typesafe-helpers": "file:/t/d.tgz",
};

const OPTIONS = { migrateBin: "/m/bin/migrate.js", timeoutMs: 1_000 };

/**
 * Stands in for the migration tool: writes the manifest it would write and its log, then answers
 * with the given exit code.
 */
class MigrationToolStub implements CommandRunner {
  readonly runs: CommandRun[] = [];
  readonly #exitCode: number | null;

  constructor(exitCode: number | null = 0) {
    this.#exitCode = exitCode;
  }

  async run(run: CommandRun): Promise<CommandOutcome> {
    this.runs.push(run);
    const manifest = { dependencies: { "openapi-typesafe-fetch": "^1.0.0" } };
    await writeFile(join(run.cwd, "package.json"), `${JSON.stringify(manifest)}\n`);
    const logPath = run.command[run.command.indexOf("--log") + 1] as string;
    const events = [
      { event: "migration_started" },
      { event: "file_migrated", path: "package.json", isChanged: true, changes: [{}, {}] },
      { event: "file_migrated", path: "ci.yml", isChanged: false, changes: [] },
      { event: "migration_finished" },
    ];
    await writeFile(logPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
    return { exitCode: this.#exitCode, isTimedOut: false, outputTail: "boom", durationMs: 1 };
  }
}

async function projectRoot(): Promise<string> {
  const root = join(await createDirectory(), "checkout");
  await mkdir(dirname(join(root, "package.json")), { recursive: true });
  return root;
}

describe("MigrationToolProjectSwitcher", () => {
  it("switchProject runs the tool with --write in the project and counts its logged changes", async () => {
    const root = await projectRoot();
    const runner = new MigrationToolStub();
    const switcher = new MigrationToolProjectSwitcher(runner, OPTIONS, new FakeProjectSwitcher());

    await writeFile(`${root}.migrate.jsonl`, '{"event":"file_migrated","isChanged":true}\n');

    const summary = await switcher.switchProject(root, SPECS);

    expect(summary).toEqual({ changedFileCount: 1, replacementCount: 2 });
    expect(runner.runs[0]?.cwd).toBe(root);
    expect(runner.runs[0]?.command.slice(1)).toEqual([
      "/m/bin/migrate.js",
      "--write",
      "--log",
      `${root}.migrate.jsonl`,
    ]);
  });

  it("switchProject pins the migrated packages to the tarballs", async () => {
    const root = await projectRoot();
    const switcher = new MigrationToolProjectSwitcher(
      new MigrationToolStub(),
      OPTIONS,
      new FakeProjectSwitcher(),
    );

    await switcher.switchProject(root, SPECS);

    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8"))).toEqual({
      dependencies: { "openapi-typesafe-fetch": "file:/t/b.tgz" },
    });
  });

  it("switchProject fails with COMMAND_FAILED when the tool fails", async () => {
    const root = await projectRoot();
    const switcher = new MigrationToolProjectSwitcher(
      new MigrationToolStub(1),
      OPTIONS,
      new FakeProjectSwitcher(),
    );

    await expect(switcher.switchProject(root, SPECS)).rejects.toMatchObject({
      code: HarnessErrorCode.CommandFailed,
      message: expect.stringContaining("boom"),
    });
  });

  it("pinUpstreamVersions is the baseline switcher's", async () => {
    const baseline = new FakeProjectSwitcher();
    const switcher = new MigrationToolProjectSwitcher(new MigrationToolStub(), OPTIONS, baseline);

    await switcher.pinUpstreamVersions("/p");

    expect(baseline.pinnedRoots).toEqual(["/p"]);
  });
});
