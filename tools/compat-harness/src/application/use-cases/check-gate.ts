import { HarnessError, HarnessErrorCode } from "../../domain/errors.ts";
import { isOptInRegression } from "../../domain/opt-in-check.ts";
import { isComparisonMismatch } from "../../domain/run-result.ts";
import { decodeComparisonResults, decodeOptInResults } from "../codecs.ts";
import { comparisonResultsPath, optInResultsPath } from "../layout.ts";
import type { FileStore } from "../ports.ts";

export interface CheckGateOptions {
  readonly goldenLabel: string;
  readonly candidateLabel: string;
  /** The label whose opt-in results are checked too; absent: none. */
  readonly optInLabel?: string;
}

export interface GateCount {
  readonly caseCount: number;
  readonly failureCount: number;
}

export interface GateVerdict {
  /** Cases of the comparison and how many of them are mismatches. */
  readonly comparison: GateCount;
  /** Opt-in cases and how many of them are regressions; null when no opt-in label was given. */
  readonly optIn: GateCount | null;
  readonly isPassed: boolean;
}

async function readRequired(cache: FileStore, path: string): Promise<string> {
  const text = await cache.readText(path);
  if (text === undefined) {
    const message = `Missing ${path}; run compare (and check-opt-in) or merge first`;
    throw new HarnessError(HarnessErrorCode.StoredFileInvalid, message);
  }
  return text;
}

async function countOptInRegressions(cache: FileStore, label: string): Promise<GateCount> {
  const checks = decodeOptInResults(await readRequired(cache, optInResultsPath(label)));
  const failureCount = checks.filter((check) => isOptInRegression(check.status)).length;
  return { caseCount: checks.length, failureCount };
}

/**
 * The release gate over stored results, for runs whose compare and check-opt-in ran in other jobs
 * (ADR-038): no mismatch of the candidate against the golden label, and no opt-in regression. The
 * same rules as the exit codes of `compare` and `check-opt-in`.
 */
export async function checkGate(cache: FileStore, options: CheckGateOptions): Promise<GateVerdict> {
  const path = comparisonResultsPath(options.goldenLabel, options.candidateLabel);
  const comparisons = decodeComparisonResults(await readRequired(cache, path));
  const comparison = {
    caseCount: comparisons.length,
    failureCount: comparisons.filter((result) => isComparisonMismatch(result.status)).length,
  };
  const optIn =
    options.optInLabel === undefined
      ? null
      : await countOptInRegressions(cache, options.optInLabel);
  const isPassed = comparison.failureCount === 0 && (optIn?.failureCount ?? 0) === 0;
  return { comparison, optIn, isPassed };
}
