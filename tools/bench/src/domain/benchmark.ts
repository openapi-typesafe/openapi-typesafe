/**
 * The generator speed benchmark (docs/benchmarks.md): each generator turns each document into
 * TypeScript through its CLI, in a fresh Node process, as a user runs it. Warm-up runs fill the
 * operating system's file cache and are dropped; the measured runs are summarized by their median,
 * which one slow run (a background task, a GC pause) cannot move.
 */

export interface BenchDocument {
  /** The short name used in the report. */
  readonly label: string;
  /** The file name in the compatibility corpus (`tools/compat-harness/.cache/compat/documents`). */
  readonly fileName: string;
}

export interface BenchGenerator {
  /** The name shown in the report, with its version, e.g. `openapi-typescript 7.13.0`. */
  readonly label: string;
  /** The `bin/cli.js` of the generator package. */
  readonly cliPath: string;
}

/** One CLI run: wall time from spawn to exit, and the peak resident memory of the process. */
export interface RunMeasurement {
  readonly wallMs: number;
  readonly peakRssBytes: number;
}

export interface RunSummary {
  readonly medianWallMs: number;
  readonly medianPeakRssBytes: number;
}

export interface BenchPlan {
  readonly documents: readonly BenchDocument[];
  /** The generator being measured (openapi-typesafe). */
  readonly candidate: BenchGenerator;
  /** The generator it is compared with (openapi-typescript 7.13.0). */
  readonly baseline: BenchGenerator;
  readonly warmupRuns: number;
  readonly measuredRuns: number;
}

export interface DocumentResult {
  readonly document: BenchDocument;
  readonly bytes: number;
  readonly candidate: RunSummary;
  readonly baseline: RunSummary;
}

/**
 * A small and a medium document (startup and parsing dominate), then the four largest public
 * API descriptions of the corpus that the README names.
 */
export const BENCH_DOCUMENTS: readonly BenchDocument[] = [
  { label: "Petstore (expanded)", fileName: "curated--oai-examples_petstore-expanded--v3.0.yaml" },
  { label: "OpenAI (YAML)", fileName: "curated--openai.com--openapi.yaml" },
  { label: "Stripe", fileName: "curated--stripe.com--spec3.json" },
  { label: "GitHub REST", fileName: "curated--github.com--3.0_descriptions_.json" },
  { label: "Cloudflare", fileName: "curated--cloudflare.com--api-schemas.json" },
  { label: "Microsoft Graph beta", fileName: "apis-guru--microsoft.com_graph-beta--1.0.1.json" },
];

/** The middle value; for an even count, the mean of the two middle values. Throws when empty. */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError("median of no values");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] as number;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] as number) + upper) / 2;
}

export function summarizeRuns(runs: readonly RunMeasurement[]): RunSummary {
  return {
    medianWallMs: median(runs.map((run) => run.wallMs)),
    medianPeakRssBytes: median(runs.map((run) => run.peakRssBytes)),
  };
}

/** Checks the run counts of a plan; a benchmark without measured runs has nothing to report. */
export function assertValidPlan(plan: BenchPlan): void {
  if (!Number.isInteger(plan.measuredRuns) || plan.measuredRuns < 1) {
    throw new RangeError(
      `measured runs must be a whole number of at least 1: ${plan.measuredRuns}`,
    );
  }
  if (!Number.isInteger(plan.warmupRuns) || plan.warmupRuns < 0) {
    throw new RangeError(`warm-up runs must be a whole number of at least 0: ${plan.warmupRuns}`);
  }
  if (plan.documents.length === 0) {
    throw new RangeError("a benchmark needs at least one document");
  }
}
