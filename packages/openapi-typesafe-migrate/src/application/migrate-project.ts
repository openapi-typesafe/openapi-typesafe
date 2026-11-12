import { MigrationBugError } from "../domain/migration-bug.js";
import type { Change, FileMigration, ManualStep } from "../domain/migration-findings.js";
import type { MigrationContext } from "./config-steps.js";
import { fileMigrationFor } from "./file-migrations.js";
import type {
  CallbackRewriter,
  DocumentReaders,
  FileProblem,
  Logger,
  ProjectFiles,
  SkippedFile,
  SourceStringScanner,
} from "./ports.js";
import { type ProjectTarget, planProjectTarget } from "./project-target.js";

export interface MigrateProjectDependencies {
  readonly files: ProjectFiles;
  readonly rewriter: CallbackRewriter;
  readonly scanner: SourceStringScanner;
  readonly readers: DocumentReaders;
  readonly logger: Logger;
}

export interface MigrateProjectInput {
  /** The openapi-typesafe version that renamed dependencies get. */
  readonly version: string;
  /** Write the changed files; without it the migration only reports (dry run). */
  readonly isWrite: boolean;
}

/**
 * What happened to the changed files. A write that fails stops the writing: the files written
 * before it are named, and so are the ones that were not written.
 */
export type WriteOutcome =
  | { readonly kind: "dry-run" }
  | { readonly kind: "written"; readonly paths: readonly string[] }
  | {
      readonly kind: "failed";
      readonly written: readonly string[];
      readonly failed: SkippedFile;
      readonly notWritten: readonly string[];
    };

/** Why a file was left as it was: it was not read, or a bug of the tool would corrupt it. */
export type SkipReason = FileProblem | { readonly kind: "migration-bug"; readonly message: string };

/** A listed file that the migration left as it was, and why. */
export interface SkippedPath {
  readonly path: string;
  readonly reason: SkipReason;
}

/**
 * What the migration found: the files with changes or manual steps, the paths that were not
 * read, and what was written.
 */
export interface ProjectMigration {
  readonly files: readonly FileReport[];
  readonly skipped: readonly SkippedPath[];
  readonly write: WriteOutcome;
}

/** What the migration found in one file. */
export interface FileReport {
  readonly path: string;
  readonly isChanged: boolean;
  readonly changes: readonly Change[];
  readonly manualSteps: readonly ManualStep[];
}

/** A file's report and the text to write; the text is undefined when nothing changed. */
interface PlannedFile {
  readonly report: FileReport;
  readonly text: string | undefined;
}

type FilePlan =
  | { readonly kind: "planned"; readonly file: PlannedFile }
  | { readonly kind: "skipped"; readonly reason: SkipReason }
  | { readonly kind: "not-migrated" };

type MigrationAttempt =
  | { readonly kind: "migrated"; readonly migration: FileMigration }
  | { readonly kind: "skipped"; readonly reason: SkipReason };

/** The migration of one file, or the bug that stopped it (see MigrationBugError). */
function attemptMigration(migrate: () => FileMigration): MigrationAttempt {
  try {
    return { kind: "migrated", migration: migrate() };
  } catch (error) {
    if (error instanceof MigrationBugError) {
      return { kind: "skipped", reason: { kind: "migration-bug", message: error.message } };
    }
    throw error;
  }
}

async function planFile(
  path: string,
  dependencies: MigrateProjectDependencies,
  target: ProjectTarget,
): Promise<FilePlan> {
  const migrate = fileMigrationFor(path, target.importMaps);
  if (migrate === undefined) {
    return { kind: "not-migrated" };
  }
  const read = await dependencies.files.read(path);
  if (read.kind === "skipped") {
    return read;
  }
  const { rewriter, scanner, readers } = dependencies;
  const { version, catalogs, manifests, aliases, apiDescriptionParts } = target;
  const context: MigrationContext = {
    ...{ version, catalogs, manifests, aliases, apiDescriptionParts },
    ...{ rewriter, scanner, readers },
  };
  const attempt = attemptMigration(() => migrate(read.text, path, context));
  if (attempt.kind === "skipped") {
    return attempt;
  }
  const { migration } = attempt;
  const isChanged = migration.text !== read.text;
  const { changes, manualSteps } = migration;
  if (isChanged || manualSteps.length > 0) {
    dependencies.logger.info("file_migrated", { path, isChanged, changes, manualSteps });
  }
  const report = { path, isChanged, changes, manualSteps };
  return { kind: "planned", file: { report, text: isChanged ? migration.text : undefined } };
}

interface ProjectPlan {
  readonly files: readonly PlannedFile[];
  readonly skipped: readonly SkippedPath[];
}

/**
 * Every file is read and migrated before anything is written, so a file that cannot be read
 * leaves the project as it was instead of half migrated. Such a file is skipped and reported.
 */
async function planProject(
  paths: readonly string[],
  dependencies: MigrateProjectDependencies,
  version: string,
): Promise<ProjectPlan> {
  const files: PlannedFile[] = [];
  const skipped: SkippedPath[] = [];
  const target = await planProjectTarget(paths, dependencies, version);
  for (const path of paths) {
    const plan = await planFile(path, dependencies, target);
    if (plan.kind === "skipped") {
      skipped.push({ path, reason: plan.reason });
      dependencies.logger.warn("file_skipped", { path, reason: plan.reason });
    } else if (plan.kind === "planned") {
      const { report } = plan.file;
      const isReported = report.isChanged || report.manualSteps.length > 0;
      files.push(...(isReported ? [plan.file] : []));
    }
  }
  return { files, skipped };
}

/** Writes the changed files in path order and stops at the first one that fails. */
async function writeFiles(
  planned: readonly PlannedFile[],
  dependencies: MigrateProjectDependencies,
): Promise<WriteOutcome> {
  const changed = planned.flatMap(({ report, text }) =>
    text === undefined ? [] : [{ path: report.path, text }],
  );
  const written: string[] = [];
  for (const [index, { path, text }] of changed.entries()) {
    const result = await dependencies.files.write(path, text);
    if (result.kind === "failed") {
      dependencies.logger.warn("file_write_failed", { path, reason: result.reason, written });
      const notWritten = changed.slice(index + 1).map((file) => file.path);
      return { kind: "failed", written, failed: { path, reason: result.reason }, notWritten };
    }
    written.push(path);
  }
  return { kind: "written", paths: written };
}

/**
 * Migrate every file of a project (ENGINEERING_PLAN 10.1): package.json files, catalogs, module
 * specifiers and `transform` callbacks in sources, and the generator command in scripts. Reads
 * and migrates every file first, then writes the changed ones, only with `isWrite`. Gives the
 * files with changes or manual steps in path order, the skipped paths, and what was written.
 */
export async function migrateProject(
  dependencies: MigrateProjectDependencies,
  input: MigrateProjectInput,
): Promise<ProjectMigration> {
  const listing = await dependencies.files.listFiles();
  const paths = [...listing.files].sort();
  dependencies.logger.info("migration_started", { fileCount: paths.length, ...input });
  const plan = await planProject(paths, dependencies, input.version);
  const skipped = [...listing.skipped, ...plan.skipped];
  const write: WriteOutcome = input.isWrite
    ? await writeFiles(plan.files, dependencies)
    : { kind: "dry-run" };
  dependencies.logger.info("migration_finished", {
    changedFiles: plan.files.length,
    skippedFiles: skipped.length,
    write: write.kind,
  });
  return { files: plan.files.map((file) => file.report), skipped, write };
}
