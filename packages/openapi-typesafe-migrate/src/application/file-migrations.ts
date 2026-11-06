import { migrateCommandLines } from "../domain/command-migration.js";
import { migratePackageManifest } from "../domain/manifest-migration.js";
import type { Change, FileMigration, ManualStep } from "../domain/migration-findings.js";
import { migrateModuleSpecifiers, SOURCE_EXTENSIONS } from "../domain/source-migration.js";
import { migrateWorkspaceCatalogs } from "../domain/workspace-catalog-migration.js";
import type { CallbackRewriter, SourceStringScanner } from "./ports.js";

/** What a migration of one kind of file needs besides the text. */
export interface MigrationContext {
  readonly version: string;
  readonly rewriter: CallbackRewriter;
  readonly scanner: SourceStringScanner;
}

/** One kind of file the migration knows, and how to migrate it. */
interface FileKind {
  readonly matches: (path: string) => boolean;
  readonly migrate: (text: string, path: string, context: MigrationContext) => FileMigration;
}

const SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([".sh", ".bash", ".zsh", ".yml", ".yaml"]);
const SCRIPT_NAMES: ReadonlySet<string> = new Set(["Makefile", "justfile", "Dockerfile"]);
const WORKSPACE_FILE = "pnpm-workspace.yaml";
const MANIFEST_FILE = "package.json";
/** The package manager writes these again on install; their entries are not commands. */
const LOCK_FILES: ReadonlySet<string> = new Set(["pnpm-lock.yaml", "yarn.lock", "bun.lock"]);

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot);
}

/** Two migrations of the same text, one after the other, with their findings joined. */
function chain(first: FileMigration, next: (text: string) => FileMigration): FileMigration {
  const second = next(first.text);
  const changes: Change[] = [...first.changes, ...second.changes];
  const manualSteps: ManualStep[] = [...first.manualSteps, ...second.manualSteps];
  return { text: second.text, changes, manualSteps };
}

/** The kinds in order; the first that matches a path migrates it. */
const FILE_KINDS: readonly FileKind[] = [
  {
    matches: (path) => baseName(path) === MANIFEST_FILE,
    migrate: (text, _path, context) => migratePackageManifest(text, context.version),
  },
  {
    matches: (path) => baseName(path) === WORKSPACE_FILE,
    migrate: (text, _path, context) => migrateWorkspaceCatalogs(text, context.version),
  },
  {
    matches: (path) => SOURCE_EXTENSIONS.has(extensionOf(path)),
    migrate: (text, path, context) =>
      chain(migrateModuleSpecifiers(text, context.scanner.scan(text, path)), (renamed) =>
        context.rewriter.rewrite(renamed, path),
      ),
  },
  {
    matches: (path) => SCRIPT_EXTENSIONS.has(extensionOf(path)) || SCRIPT_NAMES.has(baseName(path)),
    migrate: (text, path) => migrateCommandLines(text, path),
  },
];

/** The migration for a file, or undefined when the migration does not read that kind of file. */
export function fileMigrationFor(path: string): FileKind["migrate"] | undefined {
  if (LOCK_FILES.has(baseName(path))) {
    return undefined;
  }
  return FILE_KINDS.find((kind) => kind.matches(path))?.migrate;
}
