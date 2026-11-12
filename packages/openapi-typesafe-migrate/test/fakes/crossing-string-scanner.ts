import type { SourceStringScanner } from "../../src/application/ports.js";
import type { SourceString } from "../../src/domain/source-migration.js";

/**
 * A scanner with a bug: it gives two strings that cross at the start of every text that names
 * openapi-fetch, so the specifier migration stops with a MigrationBugError. Tests of how a run
 * treats such a file.
 */
export class CrossingStringScanner implements SourceStringScanner {
  scan(text: string): SourceString[] {
    if (!text.includes("openapi-fetch")) {
      return [];
    }
    const value = text.slice(0, 2);
    return [
      { start: 0, end: 2, value, isModuleSpecifier: true },
      { start: 1, end: 3, value: text.slice(1, 3), isModuleSpecifier: true },
    ];
  }
}
