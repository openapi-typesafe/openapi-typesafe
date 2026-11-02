import { ComparisonStatus, type ComparisonSummary } from "../domain/run-result.ts";
import type { CompatibilityReport } from "./report.ts";

const PERCENT_DIGITS = 2;
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
  const header = ["Option set", "Cases", ...STATUS_COLUMNS, "Byte identity", "Type identity"];
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
    "",
    "## Summary",
    "",
    ...summaryTable([["all", report.summary]]),
    "",
    "## By option set",
    "",
    ...summaryTable(Object.entries(report.byOptionSet)),
    "",
    "## Intentional differences",
    "",
    "Bug fixes that change output on purpose (ENGINEERING_PLAN 7.4). The comparison rewrites the " +
      "golden text with each change first, so a case that differs only by these counts as identical.",
    "",
    ...intentionalDifferenceTable(report),
    "",
    "## Differences and failures by category",
    "",
    ...failureTable(report),
  ];
  return `${lines.join("\n")}\n`;
}
