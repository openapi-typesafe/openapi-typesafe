import { readFile, rm } from "node:fs/promises";
import type { CommandRunner, ProjectSwitcher, ProjectSwitchSummary } from "../application/ports.ts";
import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";
import { pinMigratedPackages, type SwitchedPackageSpecs } from "../domain/package-switch.ts";
import { isPackageManifest, rewriteTree } from "./node-project-switcher.ts";

export interface MigrationToolOptions {
  /** Absolute path of the migration tool's `bin/migrate.js`. */
  readonly migrateBin: string;
  readonly timeoutMs: number;
}

/** One line of the migration tool's log; only the per-file events count. */
interface MigrationLogEvent {
  readonly event: string;
  readonly isChanged?: boolean;
  readonly changes?: readonly unknown[];
}

const FILE_MIGRATED_EVENT = "file_migrated";

/** The changed files and changes the migration tool logged, one JSON object per line. */
function summarizeMigrationLog(text: string): ProjectSwitchSummary {
  const events = text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as MigrationLogEvent)
    .filter((event) => event.event === FILE_MIGRATED_EVENT && event.isChanged === true);
  const replacementCount = events.reduce((sum, event) => sum + (event.changes?.length ?? 0), 0);
  return { changedFileCount: events.length, replacementCount };
}

/**
 * The candidate switch of ENGINEERING_PLAN 8.4 done by the migration tool of 10.1, as a user runs
 * it (`openapi-typesafe-migrate --write`). The tool gives the new packages a registry range; they
 * are then pinned to the packed tarballs. The baseline pin is the plain switcher's.
 */
export class MigrationToolProjectSwitcher implements ProjectSwitcher {
  readonly #runner: CommandRunner;
  readonly #options: MigrationToolOptions;
  readonly #baseline: ProjectSwitcher;

  constructor(runner: CommandRunner, options: MigrationToolOptions, baseline: ProjectSwitcher) {
    this.#runner = runner;
    this.#options = options;
    this.#baseline = baseline;
  }

  async switchProject(
    projectRoot: string,
    specs: SwitchedPackageSpecs,
  ): Promise<ProjectSwitchSummary> {
    const summary = await this.#migrate(projectRoot);
    await rewriteTree(projectRoot, (path) =>
      isPackageManifest(path) ? (text) => pinMigratedPackages(text, specs) : undefined,
    );
    return summary;
  }

  pinUpstreamVersions(projectRoot: string): Promise<ProjectSwitchSummary> {
    return this.#baseline.pinUpstreamVersions(projectRoot);
  }

  async #migrate(projectRoot: string): Promise<ProjectSwitchSummary> {
    // Next to the checkout, so the tool does not list its own log as a project file.
    const logPath = `${projectRoot}.migrate.jsonl`;
    // The tool appends to its log; a log of an earlier run would be counted again.
    await rm(logPath, { force: true });
    const outcome = await this.#runner.run({
      cwd: projectRoot,
      command: [process.execPath, this.#options.migrateBin, "--write", "--log", logPath],
      timeoutMs: this.#options.timeoutMs,
      logPath: `${projectRoot}.migrate.out`,
    });
    if (outcome.exitCode !== 0) {
      const message = `The migration tool failed in ${projectRoot}: ${outcome.outputTail}`;
      throw new HarnessError(HarnessErrorCode.CommandFailed, message);
    }
    return summarizeMigrationLog(await readFile(logPath, "utf8"));
  }
}
