import { isApiDescription } from "../domain/api-descriptions.js";
import { migrateCommandLines } from "../domain/command-migration.js";
import {
  type CommandPathPattern,
  DENO_TASK_PATHS,
  LINT_STAGED_COMMAND_PATHS,
  MANIFEST_COMMAND_PATHS,
  NX_PROJECT_COMMAND_PATHS,
  NX_WORKSPACE_COMMAND_PATHS,
  SIMPLE_GIT_HOOKS_COMMAND_PATHS,
} from "../domain/command-paths.js";
import { commandStringSteps } from "../domain/command-strings.js";
import { localPackagesFor, undeclaredImportSteps } from "../domain/declared-packages.js";
import { migrateDockerfile } from "../domain/dockerfile-migration.js";
import { migrateImportMap } from "../domain/import-map-migration.js";
import { importMapSteps } from "../domain/import-map-reference.js";
import { isJestConfig, jestJsonSteps, jestScriptSteps } from "../domain/jest-config.js";
import { migrateJsonCommands } from "../domain/json-command-migration.js";
import { migrateJustfile } from "../domain/justfile-migration.js";
import { migrateMakefile } from "../domain/makefile-migration.js";
import { migratePackageManifest, unreadManifest } from "../domain/manifest-migration.js";
import { type FileMigration, unchanged } from "../domain/migration-findings.js";
import { oldPackagePatchSteps, patchedOldPackage } from "../domain/patch-files.js";
import { migratePreCommitHooks } from "../domain/pre-commit-migration.js";
import {
  importedSpecifiers,
  migrateModuleSpecifiers,
  SOURCE_EXTENSIONS,
} from "../domain/source-migration.js";
import { aliasedPackagesFor } from "../domain/successor-aliases.js";
import { migrateTsconfig } from "../domain/tsconfig-migration.js";
import {
  migrateWorkspaceCatalogs,
  PNPM_WORKSPACE_FILE,
  YARNRC_FILE,
} from "../domain/workspace-catalog-migration.js";
import { TASKFILE_COMMAND_KEYS } from "../domain/yaml-command-keys.js";
import {
  migrateDependabotConfig,
  migrateYamlCommands,
  migrateYamlPathCommands,
} from "../domain/yaml-migration.js";
import {
  type ConfigStep,
  chain,
  type FileKind,
  jsonConfig,
  type MigrationContext,
  stringsStep,
  whenNamed,
  withSteps,
  yamlConfig,
} from "./config-steps.js";
import { type NamedImportMaps, NO_NAMED_IMPORT_MAPS } from "./named-import-maps.js";
import {
  baseName,
  DENO_CONFIG_FILES,
  DEPENDABOT_FILES,
  DOCKERFILE_NAMES,
  extensionOf,
  HUSKY_FOLDER,
  HUSKY_INTERNALS,
  IMPORT_MAP_FILE,
  isCiConfigFile,
  JEST_JSON_CONFIG_FILE,
  JSON5_MANIFEST_FILE,
  JUSTFILE_NAMES,
  LINT_STAGED_JSON_FILE,
  LINT_STAGED_YAML_FILES,
  LOCK_FILES,
  MAKEFILE_EXTENSION,
  MAKEFILE_NAMES,
  MANIFEST_FILE,
  NX_PROJECT_FILE,
  NX_WORKSPACE_FILE,
  PRE_COMMIT_FILES,
  PROJECT_CONFIG_NAME,
  SHELL_EXTENSIONS,
  SIMPLE_GIT_HOOKS_FILES,
  TASKFILE_NAMES,
  WORKSPACE_FILE,
  YAML_EXTENSIONS,
  YAML_MANIFEST_FILES,
  YARNRC_FILE_NAME,
} from "./project-file-names.js";

const isHuskyHook = (path: string): boolean =>
  (path.startsWith(HUSKY_FOLDER) || path.includes(`/${HUSKY_FOLDER}`)) &&
  !path.includes(HUSKY_INTERNALS);

const isDependabotConfig = (path: string): boolean =>
  [...DEPENDABOT_FILES].some((file) => path === file || path.endsWith(`/${file}`));

/** Module specifiers and `transform` callbacks are migrated; command strings are reported. */
function migrateSource(text: string, path: string, context: MigrationContext): FileMigration {
  const strings = context.scanner.scan(text, path);
  const kept = localPackagesFor(context.manifests, path);
  const migrated = chain(migrateModuleSpecifiers(text, strings, context.version, kept), (renamed) =>
    context.rewriter.rewrite(renamed, path),
  );
  const imports = importedSpecifiers(text, strings);
  const undeclared = undeclaredImportSteps(imports, path, context.manifests);
  const patterns = isJestConfig(baseName(path)) ? jestScriptSteps(text, strings) : [];
  return withSteps(migrated, [...commandStringSteps(text, strings), ...undeclared, ...patterns]);
}

const jsonCommandsStep = (patterns: readonly CommandPathPattern[]): ConfigStep =>
  stringsStep((text, strings) => migrateJsonCommands(text, strings, patterns));

/** A Deno import map, in its own file or in a config. */
const importMapStep =
  (version: string): ConfigStep =>
  (text, read) =>
    migrateImportMap(text, read, version);

const importMapFile = jsonConfig(({ version }) => [importMapStep(version)]);

/** A YAML config whose commands are at the paths of `patterns`. */
const yamlPathCommands = (patterns: readonly CommandPathPattern[]): ConfigStep =>
  stringsStep((text, strings) => migrateYamlPathCommands(text, strings, patterns));

/**
 * Configs that only hold commands, by file name: they come before the generic YAML kind, which
 * would read them by the common command keys only.
 */
const COMMAND_CONFIG_KINDS: readonly FileKind[] = [
  {
    matches: (path) => baseName(path) === NX_PROJECT_FILE,
    migrate: jsonConfig(() => [jsonCommandsStep(NX_PROJECT_COMMAND_PATHS)]),
  },
  {
    matches: (path) => baseName(path) === NX_WORKSPACE_FILE,
    migrate: jsonConfig(() => [jsonCommandsStep(NX_WORKSPACE_COMMAND_PATHS)]),
  },
  {
    matches: (path) => baseName(path) === LINT_STAGED_JSON_FILE,
    migrate: jsonConfig(() => [jsonCommandsStep(LINT_STAGED_COMMAND_PATHS)]),
  },
  {
    matches: (path) => LINT_STAGED_YAML_FILES.has(baseName(path)),
    migrate: whenNamed(yamlConfig(() => [yamlPathCommands(LINT_STAGED_COMMAND_PATHS)])),
  },
  {
    matches: (path) => SIMPLE_GIT_HOOKS_FILES.has(baseName(path)),
    migrate: jsonConfig(() => [jsonCommandsStep(SIMPLE_GIT_HOOKS_COMMAND_PATHS)]),
  },
  {
    matches: (path) => TASKFILE_NAMES.has(baseName(path)),
    migrate: whenNamed(
      yamlConfig((_context, path) => [
        stringsStep((text, strings) =>
          migrateYamlCommands(text, path, strings, TASKFILE_COMMAND_KEYS),
        ),
      ]),
    ),
  },
  {
    matches: (path) => PRE_COMMIT_FILES.has(baseName(path)),
    migrate: whenNamed(
      yamlConfig((_context, path) => [
        stringsStep((text, strings) => migratePreCommitHooks(text, path, strings)),
      ]),
    ),
  },
];

/**
 * The commands of a YAML file; an API description (an OpenAPI document) and the files it reaches
 * by `$ref` are data and stay. A CI config is never one (project-file-names.ts).
 */
const yamlCommandsStep =
  (path: string, isPart: boolean): ConfigStep =>
  (text, read) =>
    isPart || (!isCiConfigFile(path) && read.kind === "read" && isApiDescription(read.documents))
      ? unchanged(text)
      : stringsStep((current, strings) => migrateYamlCommands(current, path, strings))(text, read);

/** What the manifest at `path` is migrated with. */
const manifestTarget = ({ version, catalogs, aliases }: MigrationContext, path: string) => ({
  version,
  catalogs,
  aliased: aliasedPackagesFor(aliases, path),
});

/** The kinds in order; the first that matches a path migrates it. */
const FILE_KINDS: readonly FileKind[] = [
  {
    matches: (path) => baseName(path) === MANIFEST_FILE,
    migrate: jsonConfig((context, path) => [
      (text, read) => migratePackageManifest(text, read, manifestTarget(context, path)),
      jsonCommandsStep(MANIFEST_COMMAND_PATHS),
    ]),
  },
  {
    matches: (path) => YAML_MANIFEST_FILES.has(baseName(path)),
    migrate: yamlConfig((context, path) => [
      (text, read) => migratePackageManifest(text, read, manifestTarget(context, path)),
      yamlPathCommands(MANIFEST_COMMAND_PATHS),
    ]),
  },
  {
    matches: (path) => baseName(path) === JSON5_MANIFEST_FILE,
    migrate: unreadManifest,
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
    matches: (path) => baseName(path) === JEST_JSON_CONFIG_FILE,
    migrate: jsonConfig(() => [(text, read) => withSteps(unchanged(text), jestJsonSteps(read))]),
  },
  {
    matches: (path) => patchedOldPackage(baseName(path)) !== undefined,
    migrate: (text, path) => withSteps(unchanged(text), oldPackagePatchSteps(baseName(path))),
  },
  {
    matches: (path) => SOURCE_EXTENSIONS.has(extensionOf(path)),
    migrate: migrateSource,
  },
  ...COMMAND_CONFIG_KINDS,
  {
    matches: (path) => DENO_CONFIG_FILES.has(baseName(path)),
    migrate: jsonConfig(({ version }, path) => [
      importMapStep(version),
      (text, read) => withSteps(unchanged(text), importMapSteps(path, read)),
      jsonCommandsStep(DENO_TASK_PATHS),
    ]),
  },
  {
    matches: (path) => baseName(path) === IMPORT_MAP_FILE,
    migrate: importMapFile,
  },
  {
    matches: (path) => PROJECT_CONFIG_NAME.test(baseName(path)),
    migrate: whenNamed(jsonConfig(() => [migrateTsconfig])),
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
      yamlConfig((context, path) => [
        yamlCommandsStep(path, context.apiDescriptionParts.has(path)),
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
    matches: (path) => JUSTFILE_NAMES.has(baseName(path)),
    migrate: whenNamed((text, path) => migrateJustfile(text, path)),
  },
  {
    matches: (path) => SHELL_EXTENSIONS.has(extensionOf(path)) || isHuskyHook(path),
    migrate: whenNamed((text, path) => migrateCommandLines(text, path)),
  },
];

/**
 * The migration for a file, or undefined when the migration does not read that kind of file.
 * `namedImportMaps` are the files that a Deno config names as its import map (`"importMap":
 * "./deps.json"`): they are import maps whatever their name.
 */
export function fileMigrationFor(
  path: string,
  namedImportMaps: NamedImportMaps = NO_NAMED_IMPORT_MAPS,
): FileKind["migrate"] | undefined {
  if (LOCK_FILES.has(baseName(path))) {
    return undefined;
  }
  if (namedImportMaps.has(path)) {
    return importMapFile;
  }
  return FILE_KINDS.find((kind) => kind.matches(path))?.migrate;
}
