import type { Change, ManualStep } from "../domain/migration-findings.js";
import { fileMigrationFor, type MigrationContext } from "./file-migrations.js";
import type { CallbackRewriter, Logger, ProjectFiles } from "./ports.js";

export interface MigrateProjectDependencies {
  readonly files: ProjectFiles;
  readonly rewriter: CallbackRewriter;
  readonly logger: Logger;
}

export interface MigrateProjectInput {
  /** The openapi-typesafe version that renamed dependencies get. */
  readonly version: string;
  /** Write the changed files; without it the migration only reports (dry run). */
  readonly isWrite: boolean;
}

/** What the migration found in one file. */
export interface FileReport {
  readonly path: string;
  readonly isChanged: boolean;
  readonly changes: readonly Change[];
  readonly manualSteps: readonly ManualStep[];
}

async function migrateFile(
  path: string,
  dependencies: MigrateProjectDependencies,
  input: MigrateProjectInput,
): Promise<FileReport | undefined> {
  const migrate = fileMigrationFor(path);
  if (migrate === undefined) {
    return undefined;
  }
  const text = await dependencies.files.read(path);
  const context: MigrationContext = { version: input.version, rewriter: dependencies.rewriter };
  const migration = migrate(text, path, context);
  const isChanged = migration.text !== text;
  if (isChanged && input.isWrite) {
    await dependencies.files.write(path, migration.text);
  }
  const { changes, manualSteps } = migration;
  if (isChanged || manualSteps.length > 0) {
    dependencies.logger.info("file_migrated", { path, isChanged, changes, manualSteps });
  }
  return { path, isChanged, changes, manualSteps };
}

/**
 * Migrate every file of a project (ENGINEERING_PLAN 10.1): package.json files, pnpm catalogs,
 * module specifiers and `transform` callbacks in sources, and the generator command in scripts.
 * Writes only with `isWrite`. Returns the files with changes or manual steps, in path order.
 */
export async function migrateProject(
  dependencies: MigrateProjectDependencies,
  input: MigrateProjectInput,
): Promise<FileReport[]> {
  const paths = (await dependencies.files.listFiles()).sort();
  dependencies.logger.info("migration_started", { fileCount: paths.length, ...input });
  const reports: FileReport[] = [];
  for (const path of paths) {
    const report = await migrateFile(path, dependencies, input);
    if (report !== undefined && (report.isChanged || report.manualSteps.length > 0)) {
      reports.push(report);
    }
  }
  dependencies.logger.info("migration_finished", { changedFiles: reports.length });
  return reports;
}
