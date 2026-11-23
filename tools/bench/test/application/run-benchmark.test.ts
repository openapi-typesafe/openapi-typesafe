import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runBenchmark } from "../../src/application/run-benchmark.ts";
import type { BenchPlan } from "../../src/domain/benchmark.ts";
import {
  InMemoryDocumentFiles,
  RecordingProgressReporter,
  ScriptedGeneratorRunner,
} from "../fakes/fakes.ts";

const DOCUMENTS_DIR = join("corpus", "documents");
const TINY_PATH = join(DOCUMENTS_DIR, "tiny.yaml");
const LARGE_PATH = join(DOCUMENTS_DIR, "large.json");
const NEW_CLI = "new-cli.js";
const OLD_CLI = "old-cli.js";

const PLAN: BenchPlan = {
  documents: [
    { label: "Tiny", fileName: "tiny.yaml" },
    { label: "Large", fileName: "large.json" },
  ],
  candidate: { label: "new", cliPath: NEW_CLI },
  baseline: { label: "old", cliPath: OLD_CLI },
  warmupRuns: 1,
  measuredRuns: 3,
};

/** Measurements whose wall time and memory both equal the given numbers. */
function runs(...values: readonly number[]) {
  return values.map((value) => ({ wallMs: value, peakRssBytes: value }));
}

function ports(files = new InMemoryDocumentFiles({ [TINY_PATH]: 5, [LARGE_PATH]: 900 })) {
  return {
    runner: new ScriptedGeneratorRunner({
      // Per document: one warm-up run (999, dropped), then three measured runs.
      [NEW_CLI]: runs(999, 10, 30, 20, 999, 100, 300, 200),
      [OLD_CLI]: runs(999, 40, 60, 50, 999, 400, 600, 500),
    }),
    files,
    progress: new RecordingProgressReporter(),
  };
}

describe("runBenchmark", () => {
  it("runBenchmark drops the warm-up runs and returns the medians per document and generator", async () => {
    const results = await runBenchmark(ports(), PLAN, DOCUMENTS_DIR);

    expect(results).toEqual([
      {
        document: PLAN.documents[0],
        bytes: 5,
        candidate: { medianWallMs: 20, medianPeakRssBytes: 20 },
        baseline: { medianWallMs: 50, medianPeakRssBytes: 50 },
      },
      {
        document: PLAN.documents[1],
        bytes: 900,
        candidate: { medianWallMs: 200, medianPeakRssBytes: 200 },
        baseline: { medianWallMs: 500, medianPeakRssBytes: 500 },
      },
    ]);
  });

  it("runBenchmark lets the generators take turns within each round", async () => {
    const benchPorts = ports();

    await runBenchmark(benchPorts, PLAN, DOCUMENTS_DIR);

    expect(benchPorts.runner.runs.slice(0, 4)).toEqual([
      { cliPath: NEW_CLI, documentPath: TINY_PATH },
      { cliPath: OLD_CLI, documentPath: TINY_PATH },
      { cliPath: NEW_CLI, documentPath: TINY_PATH },
      { cliPath: OLD_CLI, documentPath: TINY_PATH },
    ]);
  });

  it("runBenchmark reports every run, the warm-up run by name", async () => {
    const benchPorts = ports();

    await runBenchmark(benchPorts, PLAN, DOCUMENTS_DIR);

    expect(benchPorts.progress.lines.slice(0, 4)).toEqual([
      "Tiny / new: warm-up 999",
      "Tiny / old: warm-up 999",
      "Tiny / new: run 1/3 10",
      "Tiny / old: run 1/3 40",
    ]);
    expect(benchPorts.progress.lines).toHaveLength(16);
  });

  it("runBenchmark with a missing document fails before it runs any generator", async () => {
    const benchPorts = ports(new InMemoryDocumentFiles({ [TINY_PATH]: 5 }));

    await expect(runBenchmark(benchPorts, PLAN, DOCUMENTS_DIR)).rejects.toThrow(/large\.json/);
    expect(benchPorts.runner.runs).toEqual([]);
  });

  it("runBenchmark with an invalid plan throws before it reads any document", async () => {
    const benchPorts = ports(new InMemoryDocumentFiles({}));

    await expect(
      runBenchmark(benchPorts, { ...PLAN, measuredRuns: 0 }, DOCUMENTS_DIR),
    ).rejects.toThrow(/measured runs/);
  });
});
