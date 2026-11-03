import type { CorpusEntryId } from "./corpus-entry.ts";

/**
 * Outcome of checking one opt-in option set on one entry against its baseline option set (the same
 * flags without the opt-in one), both from the candidate generator (roadmap plan §4).
 */
export const OptInCheckStatus = {
  /** The output is the same text as the baseline: the flag does not apply to this document. */
  Unchanged: "unchanged",
  /** The output differs and compiles under strict settings. */
  Compiles: "compiles",
  /** The output does not compile, with no more errors than the baseline output. */
  NoNewErrors: "no-new-errors",
  /** The output has more errors than the baseline output: the flag breaks it. */
  MoreErrors: "more-errors",
  /** The opt-in run failed and the baseline run succeeded. */
  CandidateFailed: "candidate-failed",
  /** The baseline run failed too, so there is nothing to compare with. */
  BaselineFailed: "baseline-failed",
} as const;

export type OptInCheckStatus = (typeof OptInCheckStatus)[keyof typeof OptInCheckStatus];

export interface OptInCheckResult {
  readonly entryId: CorpusEntryId;
  readonly optionSetId: string;
  readonly baselineOptionSetId: string;
  readonly status: OptInCheckStatus;
  /** Compiler errors of the opt-in output; null when it was not compiled. */
  readonly errorCount: number | null;
  /** Compiler errors of the baseline output; null when it was not compiled. */
  readonly baselineErrorCount: number | null;
}

const REGRESSIONS: ReadonlySet<OptInCheckStatus> = new Set([
  OptInCheckStatus.MoreErrors,
  OptInCheckStatus.CandidateFailed,
]);

/** Whether the opt-in flag made the case worse than the output without it. */
export function isOptInRegression(status: OptInCheckStatus): boolean {
  return REGRESSIONS.has(status);
}

function emptyCounts(): Record<OptInCheckStatus, number> {
  const entries = Object.values(OptInCheckStatus).map((status) => [status, 0] as const);
  return Object.fromEntries(entries) as Record<OptInCheckStatus, number>;
}

/** Cases per status, per opt-in option set, in the order the option sets first appear. */
export function summarizeOptInChecks(
  results: readonly OptInCheckResult[],
): ReadonlyMap<string, Readonly<Record<OptInCheckStatus, number>>> {
  const summary = new Map<string, Record<OptInCheckStatus, number>>();
  for (const result of results) {
    const counts = summary.get(result.optionSetId) ?? emptyCounts();
    counts[result.status]++;
    summary.set(result.optionSetId, counts);
  }
  return summary;
}
