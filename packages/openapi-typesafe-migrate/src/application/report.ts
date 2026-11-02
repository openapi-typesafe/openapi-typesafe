import {
  changeMessage,
  DRY_RUN_NOTE,
  manualStepMessage,
  NEXT_STEPS,
  NOTHING_FOUND,
  WRITTEN_NOTE,
} from "./messages.js";
import type { FileReport } from "./migrate-project.js";

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

/** The summary the command prints: changes per file, manual steps, and what to do next. */
export function renderReport(reports: readonly FileReport[], isWrite: boolean): string {
  if (reports.length === 0) {
    return `${NOTHING_FOUND}\n`;
  }
  const lines = [
    ...changesSection(reports),
    ...manualStepsSection(reports),
    "Next steps:",
    ...NEXT_STEPS.map((step, index) => `  ${index + 1}. ${step}`),
    "",
    isWrite ? WRITTEN_NOTE : DRY_RUN_NOTE,
  ];
  return `${lines.join("\n")}\n`;
}
