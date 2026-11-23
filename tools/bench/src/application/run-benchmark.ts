import { join } from "node:path";
import {
  assertValidPlan,
  type BenchDocument,
  type BenchGenerator,
  type BenchPlan,
  type DocumentResult,
  type RunMeasurement,
  summarizeRuns,
} from "../domain/benchmark.ts";
import type { DocumentFiles, GeneratorRunner, ProgressReporter } from "./ports.ts";

export interface BenchmarkPorts {
  readonly runner: GeneratorRunner;
  readonly files: DocumentFiles;
  readonly progress: ProgressReporter;
}

interface DocumentTarget {
  readonly document: BenchDocument;
  readonly path: string;
  readonly bytes: number;
}

/** Runs one generator once on a document and reports the run. */
async function runOnce(
  ports: BenchmarkPorts,
  target: DocumentTarget,
  generator: BenchGenerator,
  run: string,
): Promise<RunMeasurement> {
  const measurement = await ports.runner.run({
    cliPath: generator.cliPath,
    documentPath: target.path,
  });
  const label = `${target.document.label} / ${generator.label}`;
  ports.progress.runFinished({ label, run, wallMs: measurement.wallMs });
  return measurement;
}

/**
 * Runs both generators on one document. They take turns within each round, so a slow phase of
 * the machine (thermal throttling, a backup) hits both alike instead of one.
 */
async function benchmarkDocument(
  ports: BenchmarkPorts,
  plan: BenchPlan,
  target: DocumentTarget,
): Promise<DocumentResult> {
  for (let round = 0; round < plan.warmupRuns; round++) {
    await runOnce(ports, target, plan.candidate, "warm-up");
    await runOnce(ports, target, plan.baseline, "warm-up");
  }
  const candidateRuns: RunMeasurement[] = [];
  const baselineRuns: RunMeasurement[] = [];
  for (let round = 1; round <= plan.measuredRuns; round++) {
    const run = `run ${round}/${plan.measuredRuns}`;
    candidateRuns.push(await runOnce(ports, target, plan.candidate, run));
    baselineRuns.push(await runOnce(ports, target, plan.baseline, run));
  }
  return {
    document: target.document,
    bytes: target.bytes,
    candidate: summarizeRuns(candidateRuns),
    baseline: summarizeRuns(baselineRuns),
  };
}

/** Measures every document of the plan from `documentsDir`, in plan order. */
export async function runBenchmark(
  ports: BenchmarkPorts,
  plan: BenchPlan,
  documentsDir: string,
): Promise<DocumentResult[]> {
  assertValidPlan(plan);
  // Every document is read first, so a missing one fails before minutes of measuring the others.
  const targets: DocumentTarget[] = [];
  for (const document of plan.documents) {
    const path = join(documentsDir, document.fileName);
    targets.push({ document, path, bytes: await ports.files.byteLength(path) });
  }
  const results: DocumentResult[] = [];
  for (const target of targets) {
    results.push(await benchmarkDocument(ports, plan, target));
  }
  return results;
}
