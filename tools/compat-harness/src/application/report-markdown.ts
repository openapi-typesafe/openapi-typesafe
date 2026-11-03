import {
  type DependentResult,
  GeneratedFileStatus,
  StepStatus,
} from "../domain/dependent-result.ts";
import { ComparisonStatus, type ComparisonSummary } from "../domain/run-result.ts";
import type { CompatibilityReport, DependentsReport } from "./report.ts";

const PERCENT_DIGITS = 2;
/** Enough of a commit SHA to find it on GitHub. */
const SHORT_COMMIT_LENGTH = 12;
const STATUS_COLUMNS = Object.values(ComparisonStatus);

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(PERCENT_DIGITS)}%`;
}

/** Escape text for a markdown table cell: pipes split cells and newlines end rows. */
function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function tableRow(cells: readonly (string | number)[]): string {
  return `| ${cells.map((cell) => escapeCell(String(cell))).join(" | ")} |`;
}

function summaryTable(rows: readonly (readonly [string, ComparisonSummary])[]): string[] {
  const header = [
    "Option set",
    "Cases",
    ...STATUS_COLUMNS,
    "Byte identity",
    "Type identity",
    "Kept types",
  ];
  return [
    tableRow(header),
    tableRow(header.map(() => "---")),
    ...rows.map(([name, summary]) =>
      tableRow([
        name,
        summary.total,
        ...STATUS_COLUMNS.map((status) => summary.byStatus[status]),
        formatRate(summary.byteIdentityRate),
        formatRate(summary.typeIdentityRate),
        formatRate(summary.keptTypeRate),
      ]),
    ),
  ];
}

function failureTable(report: CompatibilityReport): string[] {
  if (report.failureGroups.length === 0) {
    return ["No differences and no failures."];
  }
  const header = ["Status", "Reason", "Cases", "Examples"];
  return [
    tableRow(header),
    tableRow(header.map(() => "---")),
    ...report.failureGroups.map((group) =>
      tableRow([group.status, group.reason, group.caseCount, group.examples.join(", ")]),
    ),
  ];
}

function intentionalDifferenceTable(report: CompatibilityReport): string[] {
  if (report.intentionalDifferences.length === 0) {
    return ["None."];
  }
  const header = ["Id", "Change", "Issues", "Cases", "Examples"];
  return [
    tableRow(header),
    tableRow(header.map(() => "---")),
    ...report.intentionalDifferences.map((difference) =>
      tableRow([
        difference.id,
        difference.description,
        difference.issues.join(", "),
        difference.caseCount,
        difference.examples.join(", "),
      ]),
    ),
  ];
}

function dependentRow(result: DependentResult): string {
  const passedSteps = result.candidate.filter((step) => step.status === StepStatus.Passed).length;
  const identicalFiles = result.generatedFiles.filter(
    (file) => file.status === GeneratedFileStatus.Identical,
  ).length;
  return tableRow([
    `[${result.projectId}](${result.repository})`,
    `\`${result.commit.slice(0, SHORT_COMMIT_LENGTH)}\``,
    result.status,
    result.failedStep ?? "",
    `${passedSteps}/${result.candidate.length}`,
    `${identicalFiles}/${result.generatedFiles.length}`,
  ]);
}

function dependentsSection(dependents: DependentsReport | null): string[] {
  if (dependents === null) {
    return ["Not run. Run `pnpm harness dependents` before the report to include them."];
  }
  const { summary } = dependents;
  const header = ["Project", "Commit", "Status", "Failed step", "Steps passed", "Same output"];
  return [
    `${summary.total} projects: ${summary.passed} passed, ${summary.regressed} regressed, ` +
      `${summary.baselineFailed} failed before the switch. Generated files with the same ` +
      `output: ${summary.identicalGeneratedFiles}/${summary.generatedFiles}.`,
    "",
    tableRow(header),
    tableRow(header.map(() => "---")),
    ...dependents.results.map(dependentRow),
  ];
}

/** A level-two section: a blank line, the heading, a blank line and the body. */
function section(title: string, body: readonly string[]): string[] {
  return ["", `## ${title}`, "", ...body];
}

/**
 * Render `compatibility-report.md`. Rates exclude cases where the golden generator failed, because
 * the candidate cannot be expected to match an output that does not exist.
 */
export function renderMarkdownReport(report: CompatibilityReport): string {
  const lines = [
    `# Compatibility report: ${report.candidateLabel} vs ${report.goldenLabel}`,
    "",
    `Generated at ${report.generatedAt}.`,
    `Golden: \`${report.goldenLabel}\`. Candidate: \`${report.candidateLabel}\`.`,
    ...section("Summary", summaryTable([["all", report.summary]])),
    ...section("By option set", summaryTable(Object.entries(report.byOptionSet))),
    ...section("Intentional differences", [
      "Bug fixes that change output on purpose (ENGINEERING_PLAN 7.4). The comparison rewrites " +
        "the golden text with each change first, so a case that differs only by these counts as " +
        "identical.",
      "",
      ...intentionalDifferenceTable(report),
    ]),
    ...section("Differences and failures by category", failureTable(report)),
    ...section("Real projects", [
      "Open-source dependents run as they are and switched to openapi-typesafe by package name " +
        "only (ENGINEERING_PLAN 8.4). Same output compares the files they generate.",
      "",
      ...dependentsSection(report.dependents),
    ]),
  ];
  return `${lines.join("\n")}\n`;
}
