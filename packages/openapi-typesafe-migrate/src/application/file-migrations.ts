import { migrateCommandLines } from "../domain/command-migration.js";
import { commandStringSteps } from "../domain/command-strings.js";
import { unreadableConfig, type YamlString } from "../domain/config-documents.js";
import {
  DENO_TASK_PATHS,
  type JsonPathPattern,
  migrateJsonCommands,
  NX_COMMAND_PATHS,
} from "../domain/json-command-migration.js";
import { migratePackageManifest } from "../domain/manifest-migration.js";
import type { Change, FileMigration, ManualStep } from "../domain/migration-findings.js";
import { migrateModuleSpecifiers, SOURCE_EXTENSIONS } from "../domain/source-migration.js";
import { migrateWorkspaceCatalogs } from "../domain/workspace-catalog-migration.js";
import {
  migrateDependabotConfig,
  migrateYamlCommands,
  migrateYamlScripts,
} from "../domain/yaml-migration.js";
import type { CallbackRewriter, DocumentReaders, SourceStringScanner } from "./ports.js";

/** What a migration of one kind of file needs besides the text. */
export interface MigrationContext {
  readonly version: string;
  readonly rewriter: CallbackRewriter;
  readonly scanner: SourceStringScanner;
  readonly readers: DocumentReaders;
}

/** One kind of file the migration knows, and how to migrate it. */
interface FileKind {
  readonly matches: (path: string) => boolean;
  readonly migrate: (text: string, path: string, context: MigrationContext) => FileMigration;
}

const SHELL_EXTENSIONS: ReadonlySet<string> = new Set([".sh", ".bash", ".zsh", ".mk"]);
const YAML_EXTENSIONS: ReadonlySet<string> = new Set([".yml", ".yaml"]);
/** Makefiles, justfiles and Dockerfiles, by the names make, just and docker look for. */
const SHELL_FILE_NAMES: ReadonlySet<string> = new Set([
  "Makefile",
  "makefile",
  "GNUmakefile",
  "justfile",
  "Justfile",
  ".justfile",
  "Dockerfile",
  "Containerfile",
]);
/** Git hooks that husky runs; `.husky/_/` holds husky's own generated scripts. */
const HUSKY_FOLDER = ".husky/";
const HUSKY_INTERNALS = ".husky/_/";
const NX_PROJECT_FILE = "project.json";
const DENO_CONFIG_FILES: ReadonlySet<string> = new Set(["deno.json", "deno.jsonc"]);
const DEPENDABOT_FILES: ReadonlySet<string> = new Set([
  ".github/dependabot.yml",
  ".github/dependabot.yaml",
]);
const WORKSPACE_FILE = "pnpm-workspace.yaml";
/** pnpm reads a manifest from `package.yaml` too; its scripts are commands. */
const YAML_MANIFEST_FILES: ReadonlySet<string> = new Set(["package.yaml", "package.yml"]);
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

const isHuskyHook = (path: string): boolean =>
  (path.startsWith(HUSKY_FOLDER) || path.includes(`/${HUSKY_FOLDER}`)) &&
  !path.includes(HUSKY_INTERNALS);

const isDependabotConfig = (path: string): boolean =>
  [...DEPENDABOT_FILES].some((file) => path === file || path.endsWith(`/${file}`));

/** A migration with more manual steps appended. */
const withSteps = (migration: FileMigration, steps: readonly ManualStep[]): FileMigration => ({
  ...migration,
  manualSteps: [...migration.manualSteps, ...steps],
});

/** Module specifiers and `transform` callbacks are migrated; command strings are reported. */
function migrateSource(text: string, path: string, context: MigrationContext): FileMigration {
  const strings = context.scanner.scan(text, path);
  const migrated = chain(migrateModuleSpecifiers(text, strings), (renamed) =>
    context.rewriter.rewrite(renamed, path),
  );
  return withSteps(migrated, commandStringSteps(text, strings));
}

/** Two migrations of the same text, one after the other, with their findings joined. */
function chain(first: FileMigration, next: (text: string) => FileMigration): FileMigration {
  const second = next(first.text);
  const changes: Change[] = [...first.changes, ...second.changes];
  const manualSteps: ManualStep[] = [...first.manualSteps, ...second.manualSteps];
  return { text: second.text, changes, manualSteps };
}

/** The commands of a JSON config at the key paths of `patterns`. */
const jsonCommands =
  (patterns: readonly JsonPathPattern[]): FileKind["migrate"] =>
  (text, _path, context) => {
    const strings = context.readers.json.strings(text);
    return strings === undefined
      ? unreadableConfig(text)
      : migrateJsonCommands(text, strings, patterns);
  };

type YamlMigration = (text: string, path: string, strings: readonly YamlString[]) => FileMigration;

/** A migration of the string scalars of a YAML file. */
const yamlStrings =
  (migrate: YamlMigration): FileKind["migrate"] =>
  (text, path, context) => {
    const strings = context.readers.yaml.strings(text);
    return strings === undefined ? unreadableConfig(text) : migrate(text, path, strings);
  };

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
    migrate: migrateSource,
  },
  {
    matches: (path) => baseName(path) === NX_PROJECT_FILE,
    migrate: jsonCommands(NX_COMMAND_PATHS),
  },
  {
    matches: (path) => DENO_CONFIG_FILES.has(baseName(path)),
    migrate: jsonCommands(DENO_TASK_PATHS),
  },
  {
    matches: (path) => YAML_MANIFEST_FILES.has(baseName(path)),
    migrate: yamlStrings((text, _path, strings) => migrateYamlScripts(text, strings)),
  },
  {
    matches: isDependabotConfig,
    migrate: yamlStrings(migrateDependabotConfig),
  },
  {
    matches: (path) => YAML_EXTENSIONS.has(extensionOf(path)),
    migrate: yamlStrings(migrateYamlCommands),
  },
  {
    matches: (path) =>
      SHELL_EXTENSIONS.has(extensionOf(path)) ||
      SHELL_FILE_NAMES.has(baseName(path)) ||
      isHuskyHook(path),
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
