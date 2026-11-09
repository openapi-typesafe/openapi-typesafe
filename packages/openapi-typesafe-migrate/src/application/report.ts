import { assertNever } from "../domain/assert-never.js";
import { terminalSafeText } from "../domain/terminal-text.js";
import { manualStepMessage } from "./manual-step-messages.js";
import {
  changeMessage,
  DRY_RUN_NOTE,
  NEXT_STEPS,
  NONE_WRITTEN,
  NOT_WRITTEN_HEADING,
  NOTHING_FOUND,
  SKIPPED_HEADING,
  skippedMessage,
  WRITTEN_HEADING,
  WRITTEN_NOTE,
  writeFailedMessage,
} from "./messages.js";
import type { FileReport, ProjectMigration, WriteOutcome } from "./migrate-project.js";
import type { SkippedFile } from "./ports.js";

function changesSection(reports: readonly FileReport[]): string[] {
  const changed = reports.filter((report) => report.changes.length > 0);
  if (changed.length === 0) {
    return [];
  }
  return [
    "Changes:",
    ...changed.flatMap((report) => [
      `  ${report.path}`,
      ...report.changes.map((change) => `    ${changeMessage(change)}`),
    ]),
    "",
  ];
}

function manualStepsSection(reports: readonly FileReport[]): string[] {
  const steps = reports.flatMap((report) =>
    report.manualSteps.map((step) => `  ${report.path}: ${manualStepMessage(step)}`),
  );
  return steps.length === 0 ? [] : ["Manual steps:", ...steps, ""];
}

function skippedSection(skipped: readonly SkippedFile[]): string[] {
  if (skipped.length === 0) {
    return [];
  }
  const lines = skipped.map((file) => `  ${file.path}: ${skippedMessage(file.reason)}`);
  return [SKIPPED_HEADING, ...lines, ""];
}

const listed = (paths: readonly string[]): string[] => paths.map((path) => `  ${path}`);

/** The end of the report: what was written, or where the writing stopped. */
function writeSection(write: WriteOutcome): string[] {
  switch (write.kind) {
    case "dry-run":
      return [DRY_RUN_NOTE];
    case "written":
      return [WRITTEN_NOTE];
    case "failed":
      return [
        writeFailedMessage(write.failed.path, write.failed.reason),
        ...(write.written.length === 0 ? [NONE_WRITTEN] : [WRITTEN_HEADING]),
        ...listed(write.written),
        ...(write.notWritten.length === 0 ? [] : [NOT_WRITTEN_HEADING]),
        ...listed(write.notWritten),
      ];
    default:
      return assertNever(write);
  }
}

/**
 * The report's lines as printed. A line quotes file names and text of the project, so each one is
 * shown as one plain line: a line break or an escape sequence in a file name must not forge a CI
 * command or erase the lines before it (terminal-text.ts).
 */
function printed(lines: readonly string[]): string {
  return `${lines.map(terminalSafeText).join("\n")}\n`;
}

/**
 * The summary the command prints: changes per file, manual steps, skipped paths, what to do
 * next, and what was written.
 */
export function renderReport(migration: ProjectMigration): string {
  const reports = migration.files;
  const skipped = skippedSection(migration.skipped);
  if (reports.length === 0) {
    return printed([...skipped, NOTHING_FOUND]);
  }
  const lines = [
    ...changesSection(reports),
    ...manualStepsSection(reports),
    ...skipped,
    "Next steps:",
    ...NEXT_STEPS.map((step, index) => `  ${index + 1}. ${step}`),
    "",
    ...writeSection(migration.write),
  ];
  return printed(lines);
}
