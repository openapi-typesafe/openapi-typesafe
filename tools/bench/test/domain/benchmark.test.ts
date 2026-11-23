import { describe, expect, it } from "vitest";
import {
  assertValidPlan,
  BENCH_DOCUMENTS,
  type BenchPlan,
  median,
  summarizeRuns,
} from "../../src/domain/benchmark.ts";

const VALID_PLAN: BenchPlan = {
  documents: [{ label: "Tiny", fileName: "tiny.yaml" }],
  candidate: { label: "new 1.0.0", cliPath: "/new/bin/cli.js" },
  baseline: { label: "old 7.0.0", cliPath: "/old/bin/cli.js" },
  warmupRuns: 1,
  measuredRuns: 3,
};

describe("median", () => {
  it("median of an odd count returns the middle value of the sorted values", () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it("median of an even count returns the mean of the two middle values", () => {
    expect(median([40, 10, 30, 20])).toBe(25);
  });

  it("median of one value returns that value", () => {
    expect(median([7])).toBe(7);
  });

  it("median of no values throws a RangeError", () => {
    expect(() => median([])).toThrow(RangeError);
  });

  it("median leaves its input in the given order", () => {
    const values = [3, 1, 2];

    median(values);

    expect(values).toEqual([3, 1, 2]);
  });
});

describe("summarizeRuns", () => {
  it("summarizeRuns of several runs returns the medians of time and memory separately", () => {
    const runs = [
      { wallMs: 100, peakRssBytes: 900 },
      { wallMs: 300, peakRssBytes: 700 },
      { wallMs: 200, peakRssBytes: 800 },
    ];

    expect(summarizeRuns(runs)).toEqual({ medianWallMs: 200, medianPeakRssBytes: 800 });
  });
});

describe("assertValidPlan", () => {
  it("assertValidPlan of a valid plan returns without an error", () => {
    expect(() => assertValidPlan(VALID_PLAN)).not.toThrow();
  });

  it("assertValidPlan with no warm-up runs accepts the plan", () => {
    expect(() => assertValidPlan({ ...VALID_PLAN, warmupRuns: 0 })).not.toThrow();
  });

  it.each([0, -1, 1.5])("assertValidPlan with %s measured runs throws", (measuredRuns) => {
    expect(() => assertValidPlan({ ...VALID_PLAN, measuredRuns })).toThrow(/measured runs/);
  });

  it.each([-1, 0.5])("assertValidPlan with %s warm-up runs throws", (warmupRuns) => {
    expect(() => assertValidPlan({ ...VALID_PLAN, warmupRuns })).toThrow(/warm-up runs/);
  });

  it("assertValidPlan without documents throws", () => {
    expect(() => assertValidPlan({ ...VALID_PLAN, documents: [] })).toThrow(/document/);
  });
});

describe("BENCH_DOCUMENTS", () => {
  it("BENCH_DOCUMENTS names each corpus file once", () => {
    const fileNames = BENCH_DOCUMENTS.map((document) => document.fileName);

    expect(new Set(fileNames).size).toBe(fileNames.length);
  });
});
