import type { CatalogPlan } from "../domain/catalog-plan.js";
import { migrateCommandLines } from "../domain/command-migration.js";
import { commandStringSteps } from "../domain/command-strings.js";
import {
  type DocumentRead,
  type DocumentString,
  documentStrings,
  unreadableConfig,
} from "../domain/config-documents.js";
import { type ManifestDeclarations, undeclaredImportSteps } from "../domain/declared-packages.js";
import { migrateDockerfile } from "../domain/dockerfile-migration.js";
import { migrateImportMap } from "../domain/import-map-migration.js";
import {
  DENO_TASK_PATHS,
  type JsonPathPattern,
  migrateJsonCommands,
  NX_COMMAND_PATHS,
  PACKAGE_SCRIPT_PATHS,
} from "../domain/json-command-migration.js";
import { migrateMakefile } from "../domain/makefile-migration.js";
import { migratePackageManifest } from "../domain/manifest-migration.js";
import {
  type Change,
  type FileMigration,
  type ManualStep,
  unchanged,
} from "../domain/migration-findings.js";
import { namesOriginalPackage } from "../domain/package-names.js";
import { migrateModuleSpecifiers, SOURCE_EXTENSIONS } from "../domain/source-migration.js";
import {
  migrateWorkspaceCatalogs,
  PNPM_WORKSPACE_FILE,
  YARNRC_FILE,
} from "../domain/workspace-catalog-migration.js";
import {
  migrateDependabotConfig,
  migrateYamlCommands,
  migrateYamlScripts,
} from "../domain/yaml-migration.js";
import type { CallbackRewriter, DocumentReaders, SourceStringScanner } from "./ports.js";

/** What a migration of one kind of file needs besides the text. */
export interface MigrationContext {
  readonly version: string;
  /** What the catalogs keep under the old names, from every manifest and catalog file. */
  readonly catalogs: CatalogPlan;
  /** What every manifest of the project declares, for the imports of a source file. */
  readonly manifests: readonly ManifestDeclarations[];
  readonly rewriter: CallbackRewriter;
  readonly scanner: SourceStringScanner;
  readonly readers: DocumentReaders;
}

/** One kind of file the migration knows, and how to migrate it. */
interface FileKind {
  readonly matches: (path: string) => boolean;
  readonly migrate: (text: string, path: string, context: MigrationContext) => FileMigration;
}

const SHELL_EXTENSIONS: ReadonlySet<string> = new Set([".sh", ".bash", ".zsh"]);
const MAKEFILE_EXTENSION = ".mk";
const YAML_EXTENSIONS: ReadonlySet<string> = new Set([".yml", ".yaml"]);
/** Makefiles, justfiles and Dockerfiles, by the names make, just and docker look for. */
const MAKEFILE_NAMES: ReadonlySet<string> = new Set(["Makefile", "makefile", "GNUmakefile"]);
const SHELL_FILE_NAMES: ReadonlySet<string> = new Set(["justfile", "Justfile", ".justfile"]);
const DOCKERFILE_NAMES: ReadonlySet<string> = new Set(["Dockerfile", "Containerfile"]);
/** Git hooks that husky runs; `.husky/_/` holds husky's own generated scripts. */
const HUSKY_FOLDER = ".husky/";
const HUSKY_INTERNALS = ".husky/_/";
const NX_PROJECT_FILE = "project.json";
const DENO_CONFIG_FILES: ReadonlySet<string> = new Set(["deno.json", "deno.jsonc"]);
/** Deno reads its import map from its config, or from a file that the config names. */
const IMPORT_MAP_FILE = "import_map.json";
const DEPENDABOT_FILES: ReadonlySet<string> = new Set([
  ".github/dependabot.yml",
  ".github/dependabot.yaml",
]);
const WORKSPACE_FILE = "pnpm-workspace.yaml";
const YARNRC_FILE_NAME = ".yarnrc.yml";
/** pnpm reads a manifest from `package.yaml` too. */
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
  const migrated = chain(migrateModuleSpecifiers(text, strings, context.version), (renamed) =>
    context.rewriter.rewrite(renamed, path),
  );
  const undeclared = undeclaredImportSteps(migrated.changes, path, context.manifests);
  return withSteps(migrated, [...commandStringSteps(text, strings), ...undeclared]);
}

/** Two migrations of the same text, one after the other, with their findings joined. */
function chain(first: FileMigration, next: (text: string) => FileMigration): FileMigration {
  const second = next(first.text);
  const changes: Change[] = [...first.changes, ...second.changes];
  const manualSteps: ManualStep[] = [...first.manualSteps, ...second.manualSteps];
  return { text: second.text, changes, manualSteps };
}

/** One migration of a config, given its text and that text read. */
type ConfigStep = (text: string, read: DocumentRead) => FileMigration;

/**
 * The steps one after the other, each on the text the step before it left. A config that cannot
 * be read is reported once, and no step runs.
 */
function migrateConfig(
  text: string,
  read: (text: string) => DocumentRead,
  steps: readonly ConfigStep[],
): FileMigration {
  const first = read(text);
  if (first.kind === "unreadable") {
    return unreadableConfig(text, first.offset);
  }
  return steps.reduce(
    (done, step) =>
      chain(done, (current) => step(current, current === text ? first : read(current))),
    unchanged(text),
  );
}

/** A step that reads the string values of the config, with their key paths. */
const stringsStep =
  (migrate: (text: string, strings: readonly DocumentString[]) => FileMigration): ConfigStep =>
  (text, read) =>
    read.kind === "unreadable"
      ? unreadableConfig(text, read.offset)
      : migrate(text, documentStrings(read.documents));

const jsonCommandsStep = (patterns: readonly JsonPathPattern[]): ConfigStep =>
  stringsStep((text, strings) => migrateJsonCommands(text, strings, patterns));

/** A JSON config migrated by `steps`. */
const jsonConfig =
  (steps: (context: MigrationContext) => readonly ConfigStep[]): FileKind["migrate"] =>
  (text, _path, context) =>
    migrateConfig(text, (current) => context.readers.json.read(current), steps(context));

/** A YAML config migrated by `steps`, which also get its path. */
const yamlConfig =
  (
    steps: (context: MigrationContext, path: string) => readonly ConfigStep[],
  ): FileKind["migrate"] =>
  (text, path, context) =>
    migrateConfig(text, (current) => context.readers.yaml.read(current), steps(context, path));

/**
 * A migration that leaves a text naming no original package as it is, without reading it. For
 * the files whose findings all start at an old name: commands and Dependabot names. Any YAML file
 * matches the command kind, and an OpenAPI document of megabytes is read in seconds, for nothing.
 */
const whenNamed =
  (migrate: FileKind["migrate"]): FileKind["migrate"] =>
  (text, path, context) =>
    namesOriginalPackage(text) ? migrate(text, path, context) : unchanged(text);

/** The kinds in order; the first that matches a path migrates it. */
const FILE_KINDS: readonly FileKind[] = [
  {
    matches: (path) => baseName(path) === MANIFEST_FILE,
    migrate: jsonConfig(({ version, catalogs }) => [
      (text, read) => migratePackageManifest(text, read, { version, catalogs }),
      jsonCommandsStep(PACKAGE_SCRIPT_PATHS),
    ]),
  },
  {
    matches: (path) => YAML_MANIFEST_FILES.has(baseName(path)),
    migrate: yamlConfig(({ version, catalogs }) => [
      (text, read) => migratePackageManifest(text, read, { version, catalogs }),
      stringsStep(migrateYamlScripts),
    ]),
  },
  {
    matches: (path) => baseName(path) === WORKSPACE_FILE,
    migrate: yamlConfig(({ version, catalogs }) => [
      (text, read) =>
        migrateWorkspaceCatalogs(text, read, { version, catalogs }, PNPM_WORKSPACE_FILE),
    ]),
  },
  {
    matches: (path) => baseName(path) === YARNRC_FILE_NAME,
    migrate: yamlConfig(({ version, catalogs }) => [
      (text, read) => migrateWorkspaceCatalogs(text, read, { version, catalogs }, YARNRC_FILE),
    ]),
  },
  {
    matches: (path) => SOURCE_EXTENSIONS.has(extensionOf(path)),
    migrate: migrateSource,
  },
  {
    matches: (path) => baseName(path) === NX_PROJECT_FILE,
    migrate: jsonConfig(() => [jsonCommandsStep(NX_COMMAND_PATHS)]),
  },
  {
    matches: (path) => DENO_CONFIG_FILES.has(baseName(path)),
    migrate: jsonConfig(({ version }) => [
      (text, read) => migrateImportMap(text, read, version),
      jsonCommandsStep(DENO_TASK_PATHS),
    ]),
  },
  {
    matches: (path) => baseName(path) === IMPORT_MAP_FILE,
    migrate: jsonConfig(({ version }) => [(text, read) => migrateImportMap(text, read, version)]),
  },
  {
    matches: isDependabotConfig,
    migrate: whenNamed(
      yamlConfig((_context, path) => [
        stringsStep((text, strings) => migrateDependabotConfig(text, path, strings)),
      ]),
    ),
  },
  {
    matches: (path) => YAML_EXTENSIONS.has(extensionOf(path)),
    migrate: whenNamed(
      yamlConfig((_context, path) => [
        stringsStep((text, strings) => migrateYamlCommands(text, path, strings)),
      ]),
    ),
  },
  {
    matches: (path) => DOCKERFILE_NAMES.has(baseName(path)),
    migrate: whenNamed((text, path) => migrateDockerfile(text, path)),
  },
  {
    matches: (path) =>
      MAKEFILE_NAMES.has(baseName(path)) || extensionOf(path) === MAKEFILE_EXTENSION,
    migrate: whenNamed((text, path) => migrateMakefile(text, path)),
  },
  {
    matches: (path) =>
      SHELL_EXTENSIONS.has(extensionOf(path)) ||
      SHELL_FILE_NAMES.has(baseName(path)) ||
      isHuskyHook(path),
    migrate: whenNamed((text, path) => migrateCommandLines(text, path)),
  },
];

/**
 * How a file takes part in the catalog plan (domain/catalogs.ts): a manifest names dependencies
 * on catalogs (and bun keeps catalogs in package.json), a workspace file holds catalogs.
 */
export interface CatalogSource {
  readonly role: "manifest" | "catalogs";
  readonly read: (text: string, readers: DocumentReaders) => DocumentRead;
}

const readJson = (text: string, readers: DocumentReaders) => readers.json.read(text);
const readYaml = (text: string, readers: DocumentReaders) => readers.yaml.read(text);

/** The part a file plays in the catalog plan, or undefined for a file that has no catalogs. */
export function catalogSourceOf(path: string): CatalogSource | undefined {
  const name = baseName(path);
  if (name === MANIFEST_FILE) {
    return { role: "manifest", read: readJson };
  }
  if (YAML_MANIFEST_FILES.has(name)) {
    return { role: "manifest", read: readYaml };
  }
  const isCatalogFile = name === WORKSPACE_FILE || name === YARNRC_FILE_NAME;
  return isCatalogFile ? { role: "catalogs", read: readYaml } : undefined;
}

/** The migration for a file, or undefined when the migration does not read that kind of file. */
export function fileMigrationFor(path: string): FileKind["migrate"] | undefined {
  if (LOCK_FILES.has(baseName(path))) {
    return undefined;
  }
  return FILE_KINDS.find((kind) => kind.matches(path))?.migrate;
}
