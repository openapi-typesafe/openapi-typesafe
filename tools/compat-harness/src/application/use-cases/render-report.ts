import { HarnessError, HarnessErrorCode } from "../../domain/errors.ts";
import type { IntentionalDifference } from "../../domain/intentional-differences.ts";
import { decodeComparisonResults, decodeGenerationResults, encodeJson } from "../codecs.ts";
import { decodeDependentResults } from "../dependents-codecs.ts";
import {
  comparisonResultsPath,
  DEPENDENTS_RESULTS_PATH,
  generationResultsPath,
  reportPaths,
} from "../layout.ts";
import type { Clock, FileStore, Logger } from "../ports.ts";
import { buildCompatibilityReport, type CompatibilityReport } from "../report.ts";
import { renderMarkdownReport } from "../report-markdown.ts";

export interface RenderReportDependencies {
  readonly cache: FileStore;
  readonly clock: Clock;
  readonly logger: Logger;
  /** The catalog the comparison used, listed in the report; none when absent. */
  readonly intentionalDifferences?: readonly IntentionalDifference[];
}

async function readRequired(cache: FileStore, path: string): Promise<string> {
  const text = await cache.readText(path);
  if (text === undefined) {
    throw new HarnessError(
      HarnessErrorCode.StoredFileInvalid,
      `Missing ${path}; run the earlier commands first`,
    );
  }
  return text;
}

/** Write the markdown and JSON compatibility report of one golden/candidate comparison. */
export async function renderReport(
  dependencies: RenderReportDependencies,
  labels: { readonly goldenLabel: string; readonly candidateLabel: string },
): Promise<CompatibilityReport> {
  const { cache } = dependencies;
  const { goldenLabel, candidateLabel } = labels;
  const dependentsText = await cache.readText(DEPENDENTS_RESULTS_PATH);
  const report = buildCompatibilityReport({
    goldenLabel,
    candidateLabel,
    generatedAt: dependencies.clock.now(),
    comparisons: decodeComparisonResults(
      await readRequired(cache, comparisonResultsPath(goldenLabel, candidateLabel)),
    ),
    goldenResults: decodeGenerationResults(
      await readRequired(cache, generationResultsPath(goldenLabel)),
    ),
    candidateResults: decodeGenerationResults(
      await readRequired(cache, generationResultsPath(candidateLabel)),
    ),
    intentionalDifferences: dependencies.intentionalDifferences ?? [],
    ...(dependentsText === undefined ? {} : { dependents: decodeDependentResults(dependentsText) }),
  });
  const paths = reportPaths(goldenLabel, candidateLabel);
  await cache.writeText(paths.markdown, renderMarkdownReport(report));
  await cache.writeText(paths.json, encodeJson(report));
  dependencies.logger.info("report_rendered", {
    markdown: cache.resolve(paths.markdown),
    total: report.summary.total,
    byteIdentityRate: report.summary.byteIdentityRate,
    typeIdentityRate: report.summary.typeIdentityRate,
    keptTypeRate: report.summary.keptTypeRate,
  });
  return report;
}
