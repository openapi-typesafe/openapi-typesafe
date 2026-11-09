import type { JsonString, YamlString } from "../domain/config-documents.js";
import type { FileMigration } from "../domain/migration-findings.js";
import type { SourceString } from "../domain/source-migration.js";

/** Why a listed file is not read: it resolves to a place outside the project folder. */
export type SkipReason = "outside-root";

/** A path that a listing named but the migration does not read or write. */
export interface SkippedFile {
  readonly path: string;
  readonly reason: SkipReason;
}

/** The files of a project, and the listed paths that were left out. */
export interface ProjectFileList {
  readonly files: readonly string[];
  readonly skipped: readonly SkippedFile[];
}

/** The project's files, by paths relative to the project root, with `/` separators. */
export interface ProjectFiles {
  /** Every file of the project, without installed packages, git metadata and build output. */
  listFiles(): Promise<ProjectFileList>;
  /** Fails for a path that resolves outside the project folder. */
  read(path: string): Promise<string>;
  /** Fails for a path that resolves outside the project folder. */
  write(path: string, text: string): Promise<void>;
}

/**
 * Rewrites the legacy `transform` callbacks of `openapiTS()` calls in one source file where that
 * is mechanical, and reports the ones it leaves (ENGINEERING_PLAN 10.1). Needs a parser.
 */
export interface CallbackRewriter {
  rewrite(text: string, path: string): FileMigration;
}

/**
 * Finds the string literals of a source file and tells which of them are module specifiers, so
 * the migration renames a package where code imports it and nowhere else. Needs a parser.
 */
export interface SourceStringScanner {
  scan(text: string, path: string): SourceString[];
}

/** Reads a JSON or JSONC document (comments, trailing commas) whose root is an object. */
export interface JsonDocumentReader {
  /** Every string value in document order, or undefined for text that is not such a document. */
  strings(text: string): JsonString[] | undefined;
}

/** Reads a YAML stream: one document or several, separated by `---`. */
export interface YamlDocumentReader {
  /** Every string scalar in document order, or undefined for text that is not valid YAML. */
  strings(text: string): YamlString[] | undefined;
}

/** The readers of the config formats whose commands and package names the migration edits. */
export interface DocumentReaders {
  readonly json: JsonDocumentReader;
  readonly yaml: YamlDocumentReader;
}

/** Structured log events, written to the log file (one JSON object per line). */
export interface Logger {
  info(event: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields?: Readonly<Record<string, unknown>>): void;
}
