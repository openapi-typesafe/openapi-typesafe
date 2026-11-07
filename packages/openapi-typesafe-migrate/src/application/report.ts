import {
  changeMessage,
  DRY_RUN_NOTE,
  manualStepMessage,
  NEXT_STEPS,
  NOTHING_FOUND,
  SKIPPED_HEADING,
  skipReasonMessage,
  WRITTEN_NOTE,
} from "./messages.js";
import type { FileReport, ProjectMigration } from "./migrate-project.js";
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
  const lines = skipped.map((file) => `  ${file.path}: ${skipReasonMessage(file.reason)}`);
  return [SKIPPED_HEADING, ...lines, ""];
}

/**
 * The summary the command prints: changes per file, manual steps, skipped paths, and what to do
 * next.
 */
export function renderReport(migration: ProjectMigration, isWrite: boolean): string {
  const reports = migration.files;
  const skipped = skippedSection(migration.skipped);
  if (reports.length === 0) {
    return `${[...skipped, NOTHING_FOUND].join("\n")}\n`;
  }
  const lines = [
    ...changesSection(reports),
    ...manualStepsSection(reports),
    ...skipped,
    "Next steps:",
    ...NEXT_STEPS.map((step, index) => `  ${index + 1}. ${step}`),
    "",
    isWrite ? WRITTEN_NOTE : DRY_RUN_NOTE,
  ];
  return `${lines.join("\n")}\n`;
}
