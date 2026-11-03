import {
  type DependentResult,
  type DependentsSummary,
  summarizeDependents,
} from "../domain/dependent-result.ts";
import type { IntentionalDifference } from "../domain/intentional-differences.ts";
import { compareOrdinal } from "../domain/ordering.ts";
import {
  type ComparisonResult,
  ComparisonStatus,
  type ComparisonSummary,
  type GenerationResult,
  summarizeComparisons,
} from "../domain/run-result.ts";

/**
 * Failures that share the first line of the generator error, for example one unsupported keyword.
 */
export interface FailureGroup {
  readonly status: ComparisonStatus;
  readonly reason: string;
  readonly caseCount: number;
  /** A few `optionSetId/entryId` examples; the JSON report keeps the full case list. */
  readonly examples: readonly string[];
}

/** An intentional difference of the catalog and the cases whose golden text it rewrote. */
export interface IntentionalDifferenceUse {
  readonly id: string;
  readonly issues: readonly string[];
  readonly description: string;
  readonly caseCount: number;
  readonly examples: readonly string[];
}

export interface CompatibilityReport {
  readonly goldenLabel: string;
  readonly candidateLabel: string;
  readonly generatedAt: string;
  readonly summary: ComparisonSummary;
  readonly byOptionSet: Readonly<Record<string, ComparisonSummary>>;
  readonly failureGroups: readonly FailureGroup[];
  readonly intentionalDifferences: readonly IntentionalDifferenceUse[];
  /** Real projects of ENGINEERING_PLAN 8.4; null when the `dependents` command has not run. */
  readonly dependents: DependentsReport | null;
  readonly comparisons: readonly ComparisonResult[];
}

export interface DependentsReport {
  readonly summary: DependentsSummary;
  readonly results: readonly DependentResult[];
}

export interface ReportInput {
  readonly goldenLabel: string;
  readonly candidateLabel: string;
  readonly generatedAt: Date;
  readonly comparisons: readonly ComparisonResult[];
  readonly goldenResults: readonly GenerationResult[];
  readonly candidateResults: readonly GenerationResult[];
  /** The catalog the comparison used; every entry is listed, also when it applied nowhere. */
  readonly intentionalDifferences: readonly IntentionalDifference[];
  /** Results of the last `dependents` run; absent when it has not run. */
  readonly dependents?: readonly DependentResult[];
}

const EXAMPLE_COUNT = 5;
const DIFFERENT_TYPES_REASON = "exported types differ";
const DIFFERENT_TEXT_REASON = "text differs (types not checked)";
const TYPES_ADDED_REASON = "every golden type kept; new exported types";
const UNKNOWN_REASON = "no error output";

const caseKey = (result: { optionSetId: string; entryId: string }): string =>
  `${result.optionSetId}/${result.entryId}`;

function firstLine(text: string): string {
  return text.split("\n")[0]?.trim() || UNKNOWN_REASON;
}

function reasonOf(
  comparison: ComparisonResult,
  errors: ReadonlyMap<string, string>,
): string | undefined {
  switch (comparison.status) {
    case ComparisonStatus.Identical:
    case ComparisonStatus.TypeIdentical:
      return undefined;
    case ComparisonStatus.TypesAdded:
      return TYPES_ADDED_REASON;
    case ComparisonStatus.Different:
      return comparison.differentTypeNames.length > 0
        ? DIFFERENT_TYPES_REASON
        : DIFFERENT_TEXT_REASON;
    case ComparisonStatus.GoldenFailed:
    case ComparisonStatus.CandidateFailed:
      return firstLine(errors.get(`${comparison.status}:${caseKey(comparison)}`) ?? "");
  }
}

function groupFailures(input: ReportInput): FailureGroup[] {
  const errors = new Map<string, string>();
  for (const result of input.goldenResults) {
    errors.set(`${ComparisonStatus.GoldenFailed}:${caseKey(result)}`, result.errorExcerpt);
  }
  for (const result of input.candidateResults) {
    errors.set(`${ComparisonStatus.CandidateFailed}:${caseKey(result)}`, result.errorExcerpt);
  }
  const groups = new Map<string, { status: ComparisonStatus; reason: string; cases: string[] }>();
  for (const comparison of input.comparisons) {
    const reason = reasonOf(comparison, errors);
    if (reason === undefined) {
      continue;
    }
    const key = `${comparison.status}:${reason}`;
    const group = groups.get(key) ?? { status: comparison.status, reason, cases: [] };
    group.cases.push(caseKey(comparison));
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ status, reason, cases }) => ({
      status,
      reason,
      caseCount: cases.length,
      examples: cases.slice(0, EXAMPLE_COUNT),
    }))
    .sort(
      (left, right) =>
        right.caseCount - left.caseCount ||
        compareOrdinal(left.status, right.status) ||
        compareOrdinal(left.reason, right.reason),
    );
}

function describeIntentionalDifferences(input: ReportInput): IntentionalDifferenceUse[] {
  return input.intentionalDifferences.map((difference) => {
    const cases = input.comparisons
      .filter((comparison) => comparison.intentionalDifferenceIds.includes(difference.id))
      .map(caseKey);
    return {
      id: difference.id,
      issues: difference.issues,
      description: difference.description,
      caseCount: cases.length,
      examples: cases.slice(0, EXAMPLE_COUNT),
    };
  });
}

function summarizeByOptionSet(
  comparisons: readonly ComparisonResult[],
): Record<string, ComparisonSummary> {
  const byOptionSet = Map.groupBy(comparisons, (comparison) => comparison.optionSetId);
  const sortedIds = [...byOptionSet.keys()].sort();
  return Object.fromEntries(
    sortedIds.map((id) => [id, summarizeComparisons(byOptionSet.get(id) ?? [])]),
  );
}

/**
 * Build the report data (ENGINEERING_PLAN 2.5). Pure: the same input always gives the same report.
 */
export function buildCompatibilityReport(input: ReportInput): CompatibilityReport {
  return {
    goldenLabel: input.goldenLabel,
    candidateLabel: input.candidateLabel,
    generatedAt: input.generatedAt.toISOString(),
    summary: summarizeComparisons(input.comparisons),
    byOptionSet: summarizeByOptionSet(input.comparisons),
    failureGroups: groupFailures(input),
    intentionalDifferences: describeIntentionalDifferences(input),
    dependents:
      input.dependents === undefined
        ? null
        : { summary: summarizeDependents(input.dependents), results: input.dependents },
    comparisons: input.comparisons,
  };
}
