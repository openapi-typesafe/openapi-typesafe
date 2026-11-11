import type { CatalogPlan } from "../domain/catalog-plan.js";
import {
  type DocumentRead,
  type DocumentString,
  documentStrings,
  unreadableConfig,
} from "../domain/config-documents.js";
import type { ManifestDeclarations } from "../domain/declared-packages.js";
import {
  type Change,
  type FileMigration,
  type ManualStep,
  unchanged,
} from "../domain/migration-findings.js";
import { namesOriginalPackage } from "../domain/package-names.js";
import type { SuccessorAliases } from "../domain/successor-aliases.js";
import type { ApiDescriptionParts } from "./api-description-parts.js";
import type { CallbackRewriter, DocumentReaders, SourceStringScanner } from "./ports.js";

/**
 * The parts that file migrations are built from: the context they get, configs read once and
 * migrated in steps, and the gate that leaves a file naming no old package unread.
 */

/** What a migration of one kind of file needs besides the text. */
export interface MigrationContext {
  readonly version: string;
  /** What the catalogs keep under the old names, from every manifest and catalog file. */
  readonly catalogs: CatalogPlan;
  /** What every manifest of the project declares, for the imports of a source file. */
  readonly manifests: readonly ManifestDeclarations[];
  /** The files whose overrides alias original packages to their successors. */
  readonly aliases: readonly SuccessorAliases[];
  /** The files that the API descriptions reach by `$ref`: data, not commands. */
  readonly apiDescriptionParts: ApiDescriptionParts;
  readonly rewriter: CallbackRewriter;
  readonly scanner: SourceStringScanner;
  readonly readers: DocumentReaders;
}

/** One kind of file the migration knows, and how to migrate it. */
export interface FileKind {
  readonly matches: (path: string) => boolean;
  readonly migrate: (text: string, path: string, context: MigrationContext) => FileMigration;
}

/** A migration with more manual steps appended. */
export const withSteps = (
  migration: FileMigration,
  steps: readonly ManualStep[],
): FileMigration => ({
  ...migration,
  manualSteps: [...migration.manualSteps, ...steps],
});

/** Two migrations of the same text, one after the other, with their findings joined. */
export function chain(first: FileMigration, next: (text: string) => FileMigration): FileMigration {
  const second = next(first.text);
  const changes: Change[] = [...first.changes, ...second.changes];
  const manualSteps: ManualStep[] = [...first.manualSteps, ...second.manualSteps];
  return { text: second.text, changes, manualSteps };
}

/** One migration of a config, given its text and that text read. */
export type ConfigStep = (text: string, read: DocumentRead) => FileMigration;

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
export const stringsStep =
  (migrate: (text: string, strings: readonly DocumentString[]) => FileMigration): ConfigStep =>
  (text, read) =>
    read.kind === "unreadable"
      ? unreadableConfig(text, read.offset)
      : migrate(text, documentStrings(read.documents));

/** A JSON config migrated by `steps`, which also get its path. */
export const jsonConfig =
  (
    steps: (context: MigrationContext, path: string) => readonly ConfigStep[],
  ): FileKind["migrate"] =>
  (text, path, context) =>
    migrateConfig(text, (current) => context.readers.json.read(current), steps(context, path));

/** A YAML config migrated by `steps`, which also get its path. */
export const yamlConfig =
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
export const whenNamed =
  (migrate: FileKind["migrate"]): FileKind["migrate"] =>
  (text, path, context) =>
    namesOriginalPackage(text) ? migrate(text, path, context) : unchanged(text);
