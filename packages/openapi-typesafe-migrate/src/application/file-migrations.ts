import { isApiDescription } from "../domain/api-descriptions.js";
import { migrateCommandLines } from "../domain/command-migration.js";
import { DENO_TASK_PATHS, MANIFEST_COMMAND_PATHS } from "../domain/command-paths.js";
import { commandStringSteps } from "../domain/command-strings.js";
import { localPackagesFor, undeclaredImportSteps } from "../domain/declared-packages.js";
import { migrateDockerfile } from "../domain/dockerfile-migration.js";
import { migrateImportMap } from "../domain/import-map-migration.js";
import { importMapSteps } from "../domain/import-map-reference.js";
import { isJestConfig, jestJsonSteps, jestScriptSteps } from "../domain/jest-config.js";
import { migrateJustfile } from "../domain/justfile-migration.js";
import { migratePackageManifest, unreadManifest } from "../domain/manifest-migration.js";
import { type FileMigration, unchanged } from "../domain/migration-findings.js";
import { oldPackagePatchSteps, patchedOldPackage } from "../domain/patch-files.js";
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
import { migrateDependabotConfig, migrateYamlCommands } from "../domain/yaml-migration.js";
import { isMakefilePath } from "./called-makefiles.js";
import {
  COMMAND_CONFIG_KINDS,
  jsonCommandsStep,
  yamlPathCommands,
} from "./command-config-kinds.js";
import {
  type ConfigStep,
  chain,
  type FileKind,
  jsonConfig,
  type MigrationContext,
  stringsStep,
  usedValuesStep,
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
  LOCK_FILES,
  MANIFEST_FILE,
  PROJECT_CONFIG_NAME,
  SHELL_EXTENSIONS,
  WORKSPACE_FILE,
  YAML_EXTENSIONS,
  YAML_MANIFEST_FILES,
  YARNRC_FILE_NAME,
} from "./project-file-names.js";
import { composeReadingOf, outsideVariablesOf, yamlKindOf } from "./yaml-file-reach.js";

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

/** A Deno import map, in its own file or in a config. */
const importMapStep =
  (version: string): ConfigStep =>
  (text, read) =>
    migrateImportMap(text, read, version);

const importMapFile = jsonConfig(({ version }) => [importMapStep(version)]);

/**
 * The commands of a YAML file; an API description (an OpenAPI document) and the files it reaches
 * by `$ref` are data and stay. A CI config is never one (project-file-names.ts).
 */
const yamlCommandsStep =
  (path: string, { apiDescriptionParts, yamlReach }: MigrationContext): ConfigStep =>
  (text, read) => {
    const isCiFile = isCiConfigFile(path) || yamlReach.kinds.has(path);
    const isApi = !isCiFile && read.kind === "read" && isApiDescription(read.documents);
    return apiDescriptionParts.has(path) || isApi
      ? unchanged(text)
      : usedValuesStep((current, values) =>
          migrateYamlCommands(current, path, values, {
            ...yamlKindOf(yamlReach, path),
            outsideVariables: outsideVariablesOf(yamlReach, path),
            ...composeReadingOf(yamlReach, path),
          }),
        )(text, read);
  };

/** What the manifest at `path` is migrated with. */
const manifestTarget = ({ version, catalogs, aliases }: MigrationContext, path: string) => ({
  version,
  catalogs,
  aliased: aliasedPackagesFor(aliases, path),
});

/** A Makefile, read with the Makefiles that include it and the files it includes. */
const makefile: FileKind["migrate"] = whenNamed((text, path, context) =>
  context.makefiles.migrate(text, path),
);

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
    migrate: whenNamed(yamlConfig((context, path) => [yamlCommandsStep(path, context)])),
  },
  {
    matches: (path) => DOCKERFILE_NAMES.has(baseName(path)),
    migrate: whenNamed((text, path) => migrateDockerfile(text, path)),
  },
  {
    matches: isMakefilePath,
    migrate: makefile,
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

/** The files that other files make of a kind whatever their name. */
export interface NamedKinds {
  /** The files that a Deno config names as its import map (`"importMap": "./deps.json"`). */
  readonly importMaps: NamedImportMaps;
  /** The files that a Makefile includes (`include config.make`), which make reads as Makefiles. */
  readonly includedMakefiles: ReadonlySet<string>;
}

export const NO_NAMED_KINDS: NamedKinds = {
  importMaps: NO_NAMED_IMPORT_MAPS,
  includedMakefiles: new Set(),
};

/**
 * The migration for a file, or undefined when the migration does not read that kind of file.
 * A file that `named` gives a kind has it whatever its name.
 */
export function fileMigrationFor(
  path: string,
  named: NamedKinds = NO_NAMED_KINDS,
): FileKind["migrate"] | undefined {
  if (LOCK_FILES.has(baseName(path))) {
    return undefined;
  }
  if (named.importMaps.has(path)) {
    return importMapFile;
  }
  if (named.includedMakefiles.has(path)) {
    return makefile;
  }
  return FILE_KINDS.find((kind) => kind.matches(path))?.migrate;
}
