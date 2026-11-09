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
  /**
   * Text differs, every type the golden file exports is identical in the candidate, and the
   * candidate exports more names (for example a numbered alias for a clashing root type).
   */
  TypesAdded: "types-added",
  /** Text differs and types differ (or were not checked). */
  Different: "different",
  /** The golden run failed too, so the case is not comparable. */
  GoldenFailed: "golden-failed",
  /**
   * Types differ, but the golden output does not compile, or merges two enums of one name that the
   * candidate keeps apart (RC4 G8), and the candidate has no more errors: a fix of invalid output,
   * which the backlog policy ships by default (ADR-021). Not comparable either.
   */
  GoldenInvalid: "golden-invalid",
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
  /**
   * Names of exported types that are not identical, or for `types-added` the names only the
   * candidate exports; empty when not checked or identical.
   */
  readonly differentTypeNames: readonly string[];
  /** Intentional differences applied to the golden text (`IntentionalDifference.id`). */
  readonly intentionalDifferenceIds: readonly string[];
}

const MATCHING_STATUSES: ReadonlySet<ComparisonStatus> = new Set([
  ComparisonStatus.Identical,
  ComparisonStatus.TypeIdentical,
  ComparisonStatus.GoldenFailed,
  ComparisonStatus.GoldenInvalid,
]);

/**
 * Whether a case fails the release gate: the candidate changed a type, failed, or (with types
 * not checked) changed the text. Added types fail too, because the gate asks for the same output.
 */
export function isComparisonMismatch(status: ComparisonStatus): boolean {
  return !MATCHING_STATUSES.has(status);
}

/** Totals per comparison status, plus the share of comparable cases that match. */
export interface ComparisonSummary {
  readonly total: number;
  readonly byStatus: Readonly<Record<ComparisonStatus, number>>;
  /** Identical text among comparable cases (golden succeeded), from 0 to 1. */
  readonly byteIdentityRate: number;
  /** Identical text or identical types among comparable cases, from 0 to 1. */
  readonly typeIdentityRate: number;
  /**
   * Cases where every golden type is kept identical, new names allowed, among comparable
   * cases, from 0 to 1: what an existing user of the golden output can rely on.
   */
  readonly keptTypeRate: number;
}

/**
 * Aggregate comparison results. Cases where the golden run failed or its output does not compile
 * are excluded from the rates.
 */
export function summarizeComparisons(results: readonly ComparisonResult[]): ComparisonSummary {
  const byStatus = Object.fromEntries(
    Object.values(ComparisonStatus).map((status) => [status, 0]),
  ) as Record<ComparisonStatus, number>;
  for (const result of results) {
    byStatus[result.status]++;
  }
  const comparable =
    results.length -
    byStatus[ComparisonStatus.GoldenFailed] -
    byStatus[ComparisonStatus.GoldenInvalid];
  const rate = (count: number): number => (comparable === 0 ? 1 : count / comparable);
  const typeIdentical =
    byStatus[ComparisonStatus.Identical] + byStatus[ComparisonStatus.TypeIdentical];
  return {
    total: results.length,
    byStatus,
    byteIdentityRate: rate(byStatus[ComparisonStatus.Identical]),
    typeIdentityRate: rate(typeIdentical),
    keptTypeRate: rate(typeIdentical + byStatus[ComparisonStatus.TypesAdded]),
  };
}
