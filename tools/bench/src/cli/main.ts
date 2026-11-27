import { mkdtemp, rm } from "node:fs/promises";
import { cpus, release, tmpdir, totalmem, type } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeDocumentFiles } from "../adapters/node-document-files.ts";
import { NodeGeneratorRunner } from "../adapters/node-generator-runner.ts";
import { packageLabelOf } from "../adapters/package-label.ts";
import { StreamProgressReporter } from "../adapters/stream-progress-reporter.ts";
import { runBenchmark } from "../application/run-benchmark.ts";
import {
  BENCH_DOCUMENTS,
  type BenchDocument,
  type BenchGenerator,
  type BenchPlan,
  selectDocuments,
} from "../domain/benchmark.ts";
import { type BenchEnvironment, renderReport } from "../domain/report.ts";
import { type BenchSettings, parseSettings } from "./settings.ts";

/** The package directory; relative paths resolve against it, not against the shell cwd. */
const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const USAGE_ERROR_EXIT_CODE = 2;
/**
 * The largest document takes about 15 s a run on a current laptop; ten minutes leaves room for a
 * machine twenty times slower and still stops a generator that hangs.
 */
const RUN_TIMEOUT_MS = 600_000;

function environment(): BenchEnvironment {
  return {
    cpu: cpus()[0]?.model ?? "unknown CPU",
    memoryBytes: totalmem(),
    operatingSystem: `${type()} ${release()}`,
    node: process.versions.node,
  };
}

async function generatorAt(path: string): Promise<BenchGenerator> {
  const cliPath = resolve(PACKAGE_ROOT, path);
  return { label: await packageLabelOf(cliPath), cliPath };
}

async function plan(
  settings: BenchSettings,
  documents: readonly BenchDocument[],
): Promise<BenchPlan> {
  return {
    documents,
    candidate: await generatorAt(settings.candidateCli),
    baseline: await generatorAt(settings.baselineCli),
    warmupRuns: settings.warmupRuns,
    measuredRuns: settings.measuredRuns,
  };
}

/** Entry point and composition root: `node src/cli/main.ts [--runs <n>] [--warmups <n>] ...`. */
async function main(argv: readonly string[]): Promise<number> {
  let settings: BenchSettings;
  let documents: readonly BenchDocument[];
  try {
    settings = parseSettings(argv);
    documents = selectDocuments(BENCH_DOCUMENTS, settings.documentFileNames);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return USAGE_ERROR_EXIT_CODE;
  }
  const benchPlan = await plan(settings, documents);
  const workDir = await mkdtemp(join(tmpdir(), "openapi-typesafe-bench-"));
  try {
    const ports = {
      runner: new NodeGeneratorRunner({ workDir, timeoutMs: RUN_TIMEOUT_MS }),
      files: new NodeDocumentFiles(),
      progress: new StreamProgressReporter((text) => process.stderr.write(text)),
    };
    const documentsDir = resolve(PACKAGE_ROOT, settings.documentsDir);
    const results = await runBenchmark(ports, benchPlan, documentsDir);
    process.stdout.write(renderReport({ ...benchPlan, environment: environment(), results }));
    return 0;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

process.exitCode = await main(process.argv.slice(2));
