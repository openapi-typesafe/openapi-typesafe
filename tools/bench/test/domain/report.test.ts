import { describe, expect, it } from "vitest";
import {
  type BenchReport,
  formatBytes,
  formatChange,
  formatDuration,
  plural,
  renderReport,
} from "../../src/domain/report.ts";

describe("formatDuration", () => {
  it("formatDuration below one second returns whole milliseconds", () => {
    expect(formatDuration(412.4)).toBe("412 ms");
  });

  it("formatDuration of one second or more returns seconds with one decimal", () => {
    expect(formatDuration(1_000)).toBe("1.0 s");
    expect(formatDuration(12_940)).toBe("12.9 s");
  });
});

describe("formatBytes", () => {
  it("formatBytes below one megabyte returns whole kilobytes", () => {
    expect(formatBytes(5_471)).toBe("5 kB");
  });

  it("formatBytes of one megabyte or more returns megabytes with one decimal", () => {
    expect(formatBytes(1_000_000)).toBe("1.0 MB");
    expect(formatBytes(27_630_274)).toBe("27.6 MB");
  });
});

describe("formatChange", () => {
  it("formatChange of a shorter time returns the percentage faster", () => {
    expect(formatChange(80, 100)).toBe("20% faster");
  });

  it("formatChange of a longer time returns the percentage slower", () => {
    expect(formatChange(125, 100)).toBe("25% slower");
  });

  it("formatChange within half a percent returns same", () => {
    expect(formatChange(100.4, 100)).toBe("same");
  });
});

describe("plural", () => {
  it("plural of one returns the noun as it is", () => {
    expect(plural(1, "run")).toBe("1 run");
  });

  it.each([0, 7])("plural of %i adds an s", (count) => {
    expect(plural(count, "warm-up run")).toBe(`${count} warm-up runs`);
  });
});

describe("renderReport", () => {
  const report: BenchReport = {
    environment: {
      cpu: "Test CPU",
      memoryBytes: 24 * 1024 ** 3,
      operatingSystem: "TestOS 1.0",
      node: "26.0.0",
    },
    candidate: { label: "new 1.0.0", cliPath: "/new/bin/cli.js" },
    baseline: { label: "old 7.0.0", cliPath: "/old/bin/cli.js" },
    warmupRuns: 1,
    measuredRuns: 5,
    results: [
      {
        document: { label: "Tiny", fileName: "tiny.yaml" },
        bytes: 5_000,
        candidate: { medianWallMs: 400, medianPeakRssBytes: 90_000_000 },
        baseline: { medianWallMs: 500, medianPeakRssBytes: 100_000_000 },
      },
    ],
  };

  it("renderReport returns the environment, the method and one table row per document", () => {
    expect(renderReport(report).split("\n")).toEqual([
      "Machine: Test CPU, 24 GiB RAM, TestOS 1.0, Node.js 26.0.0.",
      "Median of 5 runs after 1 warm-up run; default options; peak RSS is the median of the " +
        "per-run peaks.",
      "",
      "| Document | Input | new 1.0.0: time | old 7.0.0: time | Time difference | " +
        "new 1.0.0: peak RSS | old 7.0.0: peak RSS |",
      "|---|---|---|---|---|---|---|",
      "| Tiny | 5 kB | 400 ms | 500 ms | 20% faster | 90.0 MB | 100.0 MB |",
      "",
    ]);
  });
});
