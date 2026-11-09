import { migrateCommand } from "./command-migration.js";
import type { DocumentPath, JsonString } from "./config-documents.js";
import type { Change, FileMigration, ManualStep } from "./migration-findings.js";
import { applyTextEdits, type TextEdit } from "./text-edits.js";

/**
 * Commands in JSON configs of task runners: Nx `project.json` targets and Deno tasks. Only the
 * strings at command paths are migrated, and each is replaced in place, so the rest of the file
 * keeps its formatting.
 */

/** A key path pattern; `*` matches any key or index. */
export type JsonPathPattern = readonly string[];

const ANY = "*";

/** `nx:run-commands` targets: `command`, `options.command` and `options.commands`. */
export const NX_COMMAND_PATHS: readonly JsonPathPattern[] = [
  ["targets", ANY, "command"],
  ["targets", ANY, "options", "command"],
  ["targets", ANY, "options", "commands", ANY],
  ["targets", ANY, "options", "commands", ANY, "command"],
];

/** Deno tasks: a command string, or an object with a `command`. */
export const DENO_TASK_PATHS: readonly JsonPathPattern[] = [
  ["tasks", ANY],
  ["tasks", ANY, "command"],
];

const matches = (path: DocumentPath, pattern: JsonPathPattern): boolean =>
  path.length === pattern.length &&
  pattern.every((part, index) => part === ANY || part === String(path[index]));

/** Migrate the command strings of a JSON config whose key paths match one of `patterns`. */
export function migrateJsonCommands(
  text: string,
  strings: readonly JsonString[],
  patterns: readonly JsonPathPattern[],
): FileMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  const edits: TextEdit[] = [];
  for (const found of strings.filter((string) => patterns.some((p) => matches(string.path, p)))) {
    const migrated = migrateCommand(found.value, found.path.join("."));
    changes.push(...migrated.changes);
    manualSteps.push(...migrated.manualSteps);
    if (migrated.text !== found.value) {
      edits.push({ start: found.start, end: found.end, text: JSON.stringify(migrated.text) });
    }
  }
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
