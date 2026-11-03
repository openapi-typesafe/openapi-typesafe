import { HarnessError, HarnessErrorCode } from "../../domain/errors.ts";
import {
  isOptInRegression,
  type OptInCheckResult,
  OptInCheckStatus,
} from "../../domain/opt-in-check.ts";
import type { OptInOptionSet } from "../../domain/option-matrix.ts";
import { type GenerationResult, GenerationStatus } from "../../domain/run-result.ts";
import { encodeJson } from "../codecs.ts";
import { mapWithConcurrency } from "../concurrency.ts";
import { optInResultsPath, outputPath } from "../layout.ts";
import type { FileStore, Logger, OutputCompiler } from "../ports.ts";
import { caseKey, readGenerationResults, readOutput } from "../stored-outputs.ts";

export interface CheckOptInOutputsDependencies {
  readonly cache: FileStore;
  readonly logger: Logger;
  readonly outputCompiler: OutputCompiler;
}

export interface CheckOptInOutputsOptions {
  /** The label generated with the opt-in option sets and their baselines (`--option-sets opt-in`). */
  readonly label: string;
  readonly optionSets: readonly OptInOptionSet[];
  readonly concurrency: number;
}

interface OptInCase {
  readonly optionSet: OptInOptionSet;
  readonly result: GenerationResult;
  readonly baseline: GenerationResult;
}

type Verdict = Pick<OptInCheckResult, "status" | "errorCount" | "baselineErrorCount">;

const NOT_COMPILED = { errorCount: null, baselineErrorCount: null } as const;

function findCases(
  results: readonly GenerationResult[],
  optionSets: readonly OptInOptionSet[],
  label: string,
): OptInCase[] {
  const byCase = new Map(results.map((result) => [caseKey(result), result]));
  const optionSetsById = new Map(optionSets.map((optionSet) => [optionSet.id, optionSet]));
  return results.flatMap((result) => {
    const optionSet = optionSetsById.get(result.optionSetId);
    if (optionSet === undefined) {
      return [];
    }
    const key = caseKey({ optionSetId: optionSet.baselineOptionSetId, entryId: result.entryId });
    const baseline = byCase.get(key);
    if (baseline === undefined) {
      const message = `No baseline ${key} in "${label}"; generate it with --option-sets opt-in`;
      throw new HarnessError(HarnessErrorCode.StoredFileInvalid, message);
    }
    return [{ optionSet, result, baseline }];
  });
}

async function compileVerdict(
  dependencies: CheckOptInOutputsDependencies,
  label: string,
  { result, baseline }: OptInCase,
): Promise<Verdict> {
  const path = (run: GenerationResult) =>
    dependencies.cache.resolve(outputPath(label, run.optionSetId, run.entryId));
  const errorCount = await dependencies.outputCompiler.countErrors(path(result));
  if (errorCount === 0) {
    return { status: OptInCheckStatus.Compiles, errorCount, baselineErrorCount: null };
  }
  const baselineErrorCount = await dependencies.outputCompiler.countErrors(path(baseline));
  const status =
    errorCount <= baselineErrorCount ? OptInCheckStatus.NoNewErrors : OptInCheckStatus.MoreErrors;
  return { status, errorCount, baselineErrorCount };
}

async function checkCase(
  dependencies: CheckOptInOutputsDependencies,
  label: string,
  optInCase: OptInCase,
): Promise<Verdict> {
  const { result, baseline } = optInCase;
  if (baseline.status !== GenerationStatus.Ok) {
    return { status: OptInCheckStatus.BaselineFailed, ...NOT_COMPILED };
  }
  if (result.status !== GenerationStatus.Ok) {
    return { status: OptInCheckStatus.CandidateFailed, ...NOT_COMPILED };
  }
  const text = await readOutput(dependencies.cache, label, result);
  const baselineText = await readOutput(dependencies.cache, label, baseline);
  if (text === baselineText) {
    return { status: OptInCheckStatus.Unchanged, ...NOT_COMPILED };
  }
  return compileVerdict(dependencies, label, optInCase);
}

/**
 * Check every opt-in case of a label against its baseline case of the same label (roadmap plan
 * §4): the output must be unchanged, compile, or have no more errors than the output without the
 * flag. Unchanged outputs are not compiled; most documents have nothing the flag changes.
 */
export async function checkOptInOutputs(
  dependencies: CheckOptInOutputsDependencies,
  options: CheckOptInOutputsOptions,
): Promise<readonly OptInCheckResult[]> {
  const results = await readGenerationResults(dependencies.cache, options.label);
  const cases = findCases(results, options.optionSets, options.label);
  const checks = await mapWithConcurrency(cases, options.concurrency, async (optInCase) => {
    const verdict = await checkCase(dependencies, options.label, optInCase);
    const check: OptInCheckResult = {
      entryId: optInCase.result.entryId,
      optionSetId: optInCase.optionSet.id,
      baselineOptionSetId: optInCase.optionSet.baselineOptionSetId,
      ...verdict,
    };
    dependencies.logger[isOptInRegression(check.status) ? "warn" : "info"]("opt_in_checked", {
      ...check,
    });
    return check;
  });
  await dependencies.cache.writeText(optInResultsPath(options.label), encodeJson(checks));
  return checks;
}
