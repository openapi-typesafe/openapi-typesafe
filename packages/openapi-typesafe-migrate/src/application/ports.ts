import type { FileMigration } from "../domain/migration-findings.js";
import type { SourceString } from "../domain/source-migration.js";

/** The project's files, by paths relative to the project root, with `/` separators. */
export interface ProjectFiles {
  /** Every file of the project, without installed packages, git metadata and build output. */
  listFiles(): Promise<string[]>;
  read(path: string): Promise<string>;
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

/** Structured log events, written to the log file (one JSON object per line). */
export interface Logger {
  info(event: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields?: Readonly<Record<string, unknown>>): void;
}
