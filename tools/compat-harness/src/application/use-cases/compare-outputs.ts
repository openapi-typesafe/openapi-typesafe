import { HarnessError, HarnessErrorCode } from "../../domain/errors.ts";
import type { IntentionalDifference } from "../../domain/intentional-differences.ts";
import {
  type ComparisonResult,
  ComparisonStatus,
  type GenerationResult,
  GenerationStatus,
} from "../../domain/run-result.ts";
import { compareGeneratedTexts } from "../../domain/text-comparison.ts";
import { decodeGenerationResults, encodeJson } from "../codecs.ts";
import { mapWithConcurrency } from "../concurrency.ts";
import { comparisonResultsPath, generationResultsPath, outputPath } from "../layout.ts";
import type { FileStore, Logger, OutputCompiler, TypeIdentityChecker } from "../ports.ts";

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

const caseKey = (result: GenerationResult): string => `${result.optionSetId}/${result.entryId}`;

async function readGenerationResults(cache: FileStore, label: string): Promise<GenerationResult[]> {
  const text = await cache.readText(generationResultsPath(label));
  if (text === undefined) {
    const message = `No generation results for "${label}"; run the generate command first`;
    throw new HarnessError(HarnessErrorCode.StoredFileInvalid, message);
  }
  return decodeGenerationResults(text);
}

async function readOutput(
  cache: FileStore,
  label: string,
  result: GenerationResult,
): Promise<string> {
  const path = outputPath(label, result.optionSetId, result.entryId);
  const text = await cache.readText(path);
  if (text === undefined) {
    throw new HarnessError(
      HarnessErrorCode.StoredFileInvalid,
      `Output recorded as ok is missing: ${path}`,
    );
  }
  return text;
}

type TypeVerdict = Pick<ComparisonResult, "status" | "differentTypeNames">;

/** A changed golden type is a fix when the golden file does not compile and ours is no worse. */
async function changedTypesStatus(
  compiler: OutputCompiler | undefined,
  goldenPath: string,
  candidatePath: string,
): Promise<ComparisonResult["status"]> {
  const goldenErrors = compiler === undefined ? 0 : await compiler.countErrors(goldenPath);
  if (compiler === undefined || goldenErrors === 0) {
    return ComparisonStatus.Different;
  }
  const candidateErrors = await compiler.countErrors(candidatePath);
  return candidateErrors <= goldenErrors
    ? ComparisonStatus.GoldenInvalid
    : ComparisonStatus.Different;
}

async function compareTypes(
  dependencies: CompareOutputsDependencies & { readonly typeChecker: TypeIdentityChecker },
  goldenPath: string,
  candidatePath: string,
): Promise<TypeVerdict> {
  const { changed, added } = await dependencies.typeChecker.findDifferentTypes(
    goldenPath,
    candidatePath,
  );
  if (changed.length > 0) {
    const status = await changedTypesStatus(dependencies.outputCompiler, goldenPath, candidatePath);
    return { status, differentTypeNames: changed };
  }
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
    dependencies.cache.resolve(outputPath(options.goldenLabel, golden.optionSetId, golden.entryId)),
    dependencies.cache.resolve(
      outputPath(options.candidateLabel, candidate.optionSetId, candidate.entryId),
    ),
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
