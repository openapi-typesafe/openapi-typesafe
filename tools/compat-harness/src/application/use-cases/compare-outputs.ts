import type { IntentionalDifference } from "../../domain/intentional-differences.ts";
import { isEnumMergeFixed } from "../../domain/merged-enums.ts";
import {
  type ComparisonResult,
  ComparisonStatus,
  type GenerationResult,
  GenerationStatus,
} from "../../domain/run-result.ts";
import { compareGeneratedTexts } from "../../domain/text-comparison.ts";
import { encodeJson } from "../codecs.ts";
import { mapWithConcurrency } from "../concurrency.ts";
import { countErrorsOrStop, isCheckerLimit } from "../error-counts.ts";
import { comparisonResultsPath, outputPath } from "../layout.ts";
import type {
  FileStore,
  Logger,
  OutputCompiler,
  TypeDifferences,
  TypeIdentityChecker,
} from "../ports.ts";
import { caseKey, readGenerationResults, readOutput } from "../stored-outputs.ts";

export interface CompareOutputsDependencies {
  readonly cache: FileStore;
  readonly logger: Logger;
  /**
   * Absent when only the text comparison is wanted (the type check compiles every pair and is
   * slow).
   */
  readonly typeChecker?: TypeIdentityChecker;
  /**
   * Tells a fix of golden output that does not compile from a type change; without it every
   * changed type is a difference.
   */
  readonly outputCompiler?: OutputCompiler;
  /** Rewrites of the golden text for fixes made on purpose; none when absent. */
  readonly intentionalDifferences?: readonly IntentionalDifference[];
}

export interface CompareOutputsOptions {
  readonly goldenLabel: string;
  readonly candidateLabel: string;
  readonly concurrency: number;
}

type TypeVerdict = Pick<ComparisonResult, "status" | "differentTypeNames">;

/** The output files of one case, and whether the candidate keeps apart enums the golden merged. */
interface CasePaths {
  readonly goldenPath: string;
  readonly candidatePath: string;
  readonly isEnumMergeFixed: boolean;
}

/**
 * A changed golden type is a fix when the golden file does not compile, or merges two enums of one
 * name that ours keeps apart (RC4 G8), and ours is no worse. A file TypeScript stops on counts as
 * worse than any error count, so ours may stop only where it does.
 */
async function changedTypesStatus(
  dependencies: CompareOutputsDependencies,
  { goldenPath, candidatePath, isEnumMergeFixed }: CasePaths,
): Promise<ComparisonResult["status"]> {
  const { outputCompiler: compiler, logger } = dependencies;
  if (compiler === undefined) {
    return ComparisonStatus.Different;
  }
  const goldenErrors = await countErrorsOrStop(compiler, logger, goldenPath);
  if (goldenErrors === 0 && !isEnumMergeFixed) {
    return ComparisonStatus.Different;
  }
  const candidateErrors = await countErrorsOrStop(compiler, logger, candidatePath);
  return candidateErrors <= goldenErrors
    ? ComparisonStatus.GoldenInvalid
    : ComparisonStatus.Different;
}

/** The changed and added type names; null when TypeScript cannot finish the identity check. */
async function differentTypes(
  dependencies: CompareOutputsDependencies & { readonly typeChecker: TypeIdentityChecker },
  goldenPath: string,
  candidatePath: string,
): Promise<TypeDifferences | null> {
  try {
    return await dependencies.typeChecker.findDifferentTypes(goldenPath, candidatePath);
  } catch (error) {
    if (!isCheckerLimit(error)) {
      throw error;
    }
    dependencies.logger.warn("checker_limit", { path: candidatePath, message: error.message });
    return null;
  }
}

async function compareTypes(
  dependencies: CompareOutputsDependencies & { readonly typeChecker: TypeIdentityChecker },
  paths: CasePaths,
): Promise<TypeVerdict> {
  const differences = await differentTypes(dependencies, paths.goldenPath, paths.candidatePath);
  // Without the identity check every type may have changed; only the compile check can clear it.
  if (differences === null || differences.changed.length > 0) {
    const status = await changedTypesStatus(dependencies, paths);
    return { status, differentTypeNames: differences?.changed ?? [] };
  }
  const { added } = differences;
  const status = added.length === 0 ? ComparisonStatus.TypeIdentical : ComparisonStatus.TypesAdded;
  return { status, differentTypeNames: added };
}

async function compareCase(
  dependencies: CompareOutputsDependencies,
  options: CompareOutputsOptions,
  golden: GenerationResult,
  candidate: GenerationResult | undefined,
): Promise<ComparisonResult> {
  const base = {
    entryId: golden.entryId,
    optionSetId: golden.optionSetId,
    differentTypeNames: [],
    intentionalDifferenceIds: [],
  };
  const noDifference = { firstDifferentLine: null, differentLineCount: 0 };
  if (golden.status !== GenerationStatus.Ok) {
    return { ...base, ...noDifference, status: ComparisonStatus.GoldenFailed };
  }
  if (candidate?.status !== GenerationStatus.Ok) {
    return { ...base, ...noDifference, status: ComparisonStatus.CandidateFailed };
  }
  const goldenText = await readOutput(dependencies.cache, options.goldenLabel, golden);
  const candidateText = await readOutput(dependencies.cache, options.candidateLabel, candidate);
  const text = compareGeneratedTexts(
    goldenText,
    candidateText,
    dependencies.intentionalDifferences,
  );
  const lines = {
    firstDifferentLine: text.firstDifferentLine,
    differentLineCount: text.differentLineCount,
    intentionalDifferenceIds: text.intentionalDifferenceIds,
  };
  if (text.isIdentical) {
    return { ...base, ...lines, status: ComparisonStatus.Identical };
  }
  const { typeChecker } = dependencies;
  if (!typeChecker) {
    return { ...base, ...lines, status: ComparisonStatus.Different };
  }
  const verdict = await compareTypes(
    { ...dependencies, typeChecker },
    {
      goldenPath: dependencies.cache.resolve(
        outputPath(options.goldenLabel, golden.optionSetId, golden.entryId),
      ),
      candidatePath: dependencies.cache.resolve(
        outputPath(options.candidateLabel, candidate.optionSetId, candidate.entryId),
      ),
      isEnumMergeFixed: isEnumMergeFixed(goldenText, candidateText),
    },
  );
  return { ...base, ...lines, ...verdict };
}

/**
 * Compare every golden case with the candidate case of the same entry and option set
 * (ENGINEERING_PLAN 2.3 and 2.4). The golden results define the case list; a case the candidate did
 * not run counts as a failure.
 */
export async function compareOutputs(
  dependencies: CompareOutputsDependencies,
  options: CompareOutputsOptions,
): Promise<readonly ComparisonResult[]> {
  const goldenResults = await readGenerationResults(dependencies.cache, options.goldenLabel);
  const candidateResults = await readGenerationResults(dependencies.cache, options.candidateLabel);
  const candidatesByCase = new Map(candidateResults.map((result) => [caseKey(result), result]));

  const comparisons = await mapWithConcurrency(
    goldenResults,
    options.concurrency,
    async (golden) => {
      const comparison = await compareCase(
        dependencies,
        options,
        golden,
        candidatesByCase.get(caseKey(golden)),
      );
      const log = comparison.status === ComparisonStatus.Different ? "warn" : "info";
      dependencies.logger[log]("comparison_finished", {
        entryId: comparison.entryId,
        optionSetId: comparison.optionSetId,
        status: comparison.status,
        differentLineCount: comparison.differentLineCount,
      });
      return comparison;
    },
  );
  const path = comparisonResultsPath(options.goldenLabel, options.candidateLabel);
  await dependencies.cache.writeText(path, encodeJson(comparisons));
  return comparisons;
}
