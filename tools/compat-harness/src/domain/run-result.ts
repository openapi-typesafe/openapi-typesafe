import type { CorpusEntryId } from "./corpus-entry.ts";

/** Outcome of one generator run on one corpus entry with one option set. */
export const GenerationStatus = {
  Ok: "ok",
  Failed: "failed",
  TimedOut: "timed-out",
} as const;

export type GenerationStatus = (typeof GenerationStatus)[keyof typeof GenerationStatus];

export interface GenerationResult {
  readonly entryId: CorpusEntryId;
  readonly optionSetId: string;
  readonly status: GenerationStatus;
  readonly durationMs: number;
  /** First lines of the generator's error output; empty when the run succeeded. */
  readonly errorExcerpt: string;
}

/** Outcome of comparing golden and candidate output for one entry and option set. */
export const ComparisonStatus = {
  /** Text identical after normalization. */
  Identical: "identical",
  /** Text differs, exported types are identical. */
  TypeIdentical: "type-identical",
  /** Text differs and types differ (or were not checked). */
  Different: "different",
  /** The golden run failed too, so the case is not comparable. */
  GoldenFailed: "golden-failed",
  /** The golden run succeeded and the candidate run failed. */
  CandidateFailed: "candidate-failed",
} as const;

export type ComparisonStatus = (typeof ComparisonStatus)[keyof typeof ComparisonStatus];

export interface ComparisonResult {
  readonly entryId: CorpusEntryId;
  readonly optionSetId: string;
  readonly status: ComparisonStatus;
  readonly firstDifferentLine: number | null;
  readonly differentLineCount: number;
  /** Names of exported types that are not identical; empty when not checked or identical. */
  readonly differentTypeNames: readonly string[];
}

/** Totals per comparison status, plus the share of comparable cases that match. */
export interface ComparisonSummary {
  readonly total: number;
  readonly byStatus: Readonly<Record<ComparisonStatus, number>>;
  /** Identical text among comparable cases (golden succeeded), from 0 to 1. */
  readonly byteIdentityRate: number;
  /** Identical text or identical types among comparable cases, from 0 to 1. */
  readonly typeIdentityRate: number;
}

/** Aggregate comparison results. Cases where the golden run failed are excluded from the rates. */
export function summarizeComparisons(results: readonly ComparisonResult[]): ComparisonSummary {
  const byStatus = Object.fromEntries(
    Object.values(ComparisonStatus).map((status) => [status, 0]),
  ) as Record<ComparisonStatus, number>;
  for (const result of results) {
    byStatus[result.status]++;
  }
  const comparable = results.length - byStatus[ComparisonStatus.GoldenFailed];
  const rate = (count: number): number => (comparable === 0 ? 1 : count / comparable);
  return {
    total: results.length,
    byStatus,
    byteIdentityRate: rate(byStatus[ComparisonStatus.Identical]),
    typeIdentityRate: rate(
      byStatus[ComparisonStatus.Identical] + byStatus[ComparisonStatus.TypeIdentical],
    ),
  };
}
