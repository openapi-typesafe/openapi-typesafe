import { CliGeneratorRunner } from "../adapters/cli-generator-runner.ts";
import { TypeScriptIdentityChecker } from "../adapters/typescript-identity-checker.ts";
import { decodeManifest } from "../application/codecs.ts";
import { REPOSITORY_PATHS } from "../application/layout.ts";
import { buildManifest } from "../application/use-cases/build-manifest.ts";
import { compareOutputs } from "../application/use-cases/compare-outputs.ts";
import { FetchStatus, fetchCorpus } from "../application/use-cases/fetch-corpus.ts";
import { generateOutputs } from "../application/use-cases/generate-outputs.ts";
import { renderReport } from "../application/use-cases/render-report.ts";
import type { CorpusEntry } from "../domain/corpus-entry.ts";
import { selectCorpusSubset } from "../domain/corpus-subset.ts";
import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";
import type { CorpusManifest } from "../domain/manifest.ts";
import { selectOptionSets } from "../domain/option-matrix.ts";
import { ComparisonStatus, GenerationStatus } from "../domain/run-result.ts";
import type { HarnessContainer } from "./container.ts";
import { HARNESS_DEFAULTS, HarnessCommand, requireOption } from "./settings.ts";
import { printLine } from "./terminal.ts";

/** Exit code of a command: 0 when everything it checked passed, 1 otherwise. */
export type ExitCode = 0 | 1;

async function readManifest(container: HarnessContainer): Promise<CorpusManifest> {
  const text = await container.repository.readText(REPOSITORY_PATHS.manifest);
  if (text === undefined) {
    throw new HarnessError(
      HarnessErrorCode.StoredFileInvalid,
      "No corpus manifest; run the manifest command first",
    );
  }
  return decodeManifest(text);
}

function selectEntries(container: HarnessContainer, manifest: CorpusManifest): CorpusEntry[] {
  const { corpus } = container.settings;
  return corpus === "all" ? [...manifest.entries] : selectCorpusSubset(manifest.entries, corpus);
}

async function runManifest(container: HarnessContainer): Promise<ExitCode> {
  const manifest = await buildManifest(container, container.settings.apisGuruListUrl);
  printLine(`Manifest: ${manifest.entries.length} entries`);
  return 0;
}

async function runFetch(container: HarnessContainer): Promise<ExitCode> {
  const manifest = await readManifest(container);
  const { outcomes } = await fetchCorpus(container, manifest, {
    entries: selectEntries(container, manifest),
    concurrency: container.settings.concurrency ?? HARNESS_DEFAULTS.fetchConcurrency,
    retry: {
      attempts: HARNESS_DEFAULTS.retryAttempts,
      initialDelayMs: HARNESS_DEFAULTS.retryInitialDelayMs,
    },
    isHashUpdateAllowed: container.settings.isHashUpdateAllowed,
  });
  const counts = Object.values(FetchStatus).map(
    (status) => `${status}=${outcomes.filter((o) => o.status === status).length}`,
  );
  printLine(`Fetch: ${counts.join(" ")}`);
  const isClean = outcomes.every(
    (o) => o.status === FetchStatus.Cached || o.status === FetchStatus.Downloaded,
  );
  return isClean ? 0 : 1;
}

async function runGenerate(container: HarnessContainer): Promise<ExitCode> {
  const { settings } = container;
  const manifest = await readManifest(container);
  const cliPath = container.resolvePath(
    requireOption(settings.cli, "cli", HarnessCommand.Generate),
  );
  const results = await generateOutputs(
    { cache: container.cache, runner: new CliGeneratorRunner(cliPath), logger: container.logger },
    {
      label: requireOption(settings.label, "label", HarnessCommand.Generate),
      entries: selectEntries(container, manifest),
      optionSets: selectOptionSets(settings.optionSets),
      concurrency: settings.concurrency ?? HARNESS_DEFAULTS.workConcurrency,
      timeoutMs: settings.timeoutMs,
    },
  );
  const counts = Object.values(GenerationStatus).map(
    (status) => `${status}=${results.filter((r) => r.status === status).length}`,
  );
  printLine(`Generate: ${counts.join(" ")}`);
  // Failing documents are expected in a real-world corpus, so generation itself always succeeds.
  return 0;
}

function readLabels(container: HarnessContainer, command: HarnessCommand) {
  return {
    goldenLabel: requireOption(container.settings.golden, "golden", command),
    candidateLabel: requireOption(container.settings.candidate, "candidate", command),
  };
}

async function runCompare(container: HarnessContainer): Promise<ExitCode> {
  const { settings } = container;
  const comparisons = await compareOutputs(
    {
      cache: container.cache,
      logger: container.logger,
      ...(settings.isTypeCheckEnabled ? { typeChecker: new TypeScriptIdentityChecker() } : {}),
    },
    {
      ...readLabels(container, HarnessCommand.Compare),
      concurrency: settings.concurrency ?? HARNESS_DEFAULTS.workConcurrency,
    },
  );
  const matching: readonly string[] = [
    ComparisonStatus.Identical,
    ComparisonStatus.TypeIdentical,
    ComparisonStatus.GoldenFailed,
  ];
  const mismatches = comparisons.filter(
    (comparison) => !matching.includes(comparison.status),
  ).length;
  printLine(`Compare: ${comparisons.length} cases, ${mismatches} mismatches`);
  return mismatches === 0 ? 0 : 1;
}

async function runReport(container: HarnessContainer): Promise<ExitCode> {
  const report = await renderReport(container, readLabels(container, HarnessCommand.Report));
  const { byteIdentityRate, typeIdentityRate } = report.summary;
  printLine(`Report: byte identity ${byteIdentityRate}, type identity ${typeIdentityRate}`);
  return 0;
}

/** Command table: a new command is a new entry here, not a new branch in `main`. */
export const COMMANDS: Readonly<
  Record<HarnessCommand, (container: HarnessContainer) => Promise<ExitCode>>
> = {
  [HarnessCommand.Manifest]: runManifest,
  [HarnessCommand.Fetch]: runFetch,
  [HarnessCommand.Generate]: runGenerate,
  [HarnessCommand.Compare]: runCompare,
  [HarnessCommand.Report]: runReport,
};
