import { migrateCommand } from "./command-migration.js";
import { type CommandPathPattern, isCommandPath } from "./command-paths.js";
import type { DocumentString } from "./config-documents.js";
import type { Change, FileMigration, ManualStep } from "./migration-findings.js";
import { applyTextEdits, type TextEdit } from "./text-edits.js";

/**
 * Commands in JSON configs, at the paths of domain/command-paths.ts. Only the strings at those
 * paths are migrated, and each is replaced in place, so the rest of the file keeps its formatting.
 */

/** Migrate the command strings of a JSON config whose key paths match one of `patterns`. */
export function migrateJsonCommands(
  text: string,
  strings: readonly DocumentString[],
  patterns: readonly CommandPathPattern[],
): FileMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  const edits: TextEdit[] = [];
  for (const found of strings.filter((string) => isCommandPath(string.path, patterns))) {
    const migrated = migrateCommand(found.value, found.path.join("."));
    changes.push(...migrated.changes);
    manualSteps.push(...migrated.manualSteps);
    if (migrated.text !== found.value) {
      edits.push({ start: found.start, end: found.end, text: JSON.stringify(migrated.text) });
    }
  }
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
