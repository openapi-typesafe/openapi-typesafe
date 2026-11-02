import { describe, expect, it } from "vitest";
import { encodeJson } from "../../src/application/codecs.ts";
import {
  comparisonResultsPath,
  generationResultsPath,
  reportPaths,
} from "../../src/application/layout.ts";
import { buildCompatibilityReport, type ReportInput } from "../../src/application/report.ts";
import { renderMarkdownReport } from "../../src/application/report-markdown.ts";
import { renderReport } from "../../src/application/use-cases/render-report.ts";
import type { CorpusEntryId } from "../../src/domain/corpus-entry.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import {
  type ComparisonResult,
  ComparisonStatus,
  type GenerationResult,
  GenerationStatus,
} from "../../src/domain/run-result.ts";
import { FixedClock } from "../fakes/fixed-clock.ts";
import { InMemoryFileStore } from "../fakes/in-memory-file-store.ts";
import { RecordingLogger } from "../fakes/recording-logger.ts";

const NOW = "2026-11-02T12:00:00.000Z";

function comparison(
  entryId: string,
  status: ComparisonStatus,
  extra: Partial<ComparisonResult> = {},
) {
  const base = { firstDifferentLine: null, differentLineCount: 0, differentTypeNames: [] };
  return { entryId: entryId as CorpusEntryId, optionSetId: "default", status, ...base, ...extra };
}

function generation(
  entryId: string,
  status: GenerationStatus,
  errorExcerpt = "",
): GenerationResult {
  return {
    entryId: entryId as CorpusEntryId,
    optionSetId: "default",
    status,
    durationMs: 1,
    errorExcerpt,
  };
}

const INPUT: ReportInput = {
  goldenLabel: "fork-base",
  candidateLabel: "current",
  generatedAt: new Date(NOW),
  comparisons: [
    comparison("a", ComparisonStatus.Identical),
    comparison("b", ComparisonStatus.Different, {
      differentTypeNames: ["paths"],
      differentLineCount: 3,
    }),
    comparison("c", ComparisonStatus.Different, { differentLineCount: 1 }),
    comparison("d", ComparisonStatus.CandidateFailed),
    comparison("e", ComparisonStatus.CandidateFailed),
    comparison("f", ComparisonStatus.GoldenFailed),
    { ...comparison("g", ComparisonStatus.TypeIdentical), optionSetId: "enum" },
  ],
  goldenResults: [generation("f", GenerationStatus.Failed, "Error: unsupported | keyword\nat x")],
  candidateResults: [
    generation("d", GenerationStatus.Failed, "TypeError: boom\n  at y"),
    generation("e", GenerationStatus.TimedOut),
  ],
};

describe("buildCompatibilityReport", () => {
  it("buildCompatibilityReport groups failures by status and first error line, by status and reason in code-point order", () => {
    const report = buildCompatibilityReport(INPUT);

    expect(
      report.failureGroups.map((group) => [group.status, group.reason, group.caseCount]),
    ).toEqual([
      [ComparisonStatus.CandidateFailed, "TypeError: boom", 1],
      [ComparisonStatus.CandidateFailed, "no error output", 1],
      [ComparisonStatus.Different, "exported types differ", 1],
      [ComparisonStatus.Different, "text differs (types not checked)", 1],
      [ComparisonStatus.GoldenFailed, "Error: unsupported | keyword", 1],
    ]);
    expect(report.failureGroups[0]?.examples).toEqual(["default/d"]);
  });

  it("buildCompatibilityReport puts larger groups first", () => {
    const comparisons = [...INPUT.comparisons, comparison("h", ComparisonStatus.Different)];

    const report = buildCompatibilityReport({ ...INPUT, comparisons });

    expect(report.failureGroups[0]).toMatchObject({
      reason: "text differs (types not checked)",
      caseCount: 2,
    });
  });

  it("buildCompatibilityReport summarizes overall and per option set", () => {
    const report = buildCompatibilityReport(INPUT);

    expect(report.generatedAt).toBe(NOW);
    expect(report.summary.total).toBe(7);
    expect(Object.keys(report.byOptionSet)).toEqual(["default", "enum"]);
    expect(report.byOptionSet.enum?.typeIdentityRate).toBe(1);
  });
});

describe("renderMarkdownReport", () => {
  it("renderMarkdownReport renders the summary, option sets and escaped failure table", () => {
    const markdown = renderMarkdownReport(buildCompatibilityReport(INPUT));

    expect(markdown).toContain("# Compatibility report: current vs fork-base");
    expect(markdown).toContain("| all | 7 | 1 | 1 | 2 | 1 | 2 | 16.67% | 33.33% |");
    expect(markdown).toContain("Error: unsupported \\| keyword");
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("renderMarkdownReport without failures says so", () => {
    const report = buildCompatibilityReport({
      ...INPUT,
      comparisons: [comparison("a", ComparisonStatus.Identical)],
    });

    expect(renderMarkdownReport(report)).toContain("No differences and no failures.");
  });
});

describe("renderReport", () => {
  function setUp() {
    const cache = new InMemoryFileStore({
      [comparisonResultsPath("fork-base", "current")]: encodeJson(INPUT.comparisons),
      [generationResultsPath("fork-base")]: encodeJson(INPUT.goldenResults),
      [generationResultsPath("current")]: encodeJson(INPUT.candidateResults),
    });
    return {
      cache,
      dependencies: { cache, clock: new FixedClock(NOW), logger: new RecordingLogger() },
    };
  }

  it("renderReport writes the markdown and JSON reports", async () => {
    const { cache, dependencies } = setUp();

    const report = await renderReport(dependencies, {
      goldenLabel: "fork-base",
      candidateLabel: "current",
    });

    const paths = reportPaths("fork-base", "current");
    expect(cache.files.get(paths.markdown)).toBe(renderMarkdownReport(report));
    expect(JSON.parse(cache.files.get(paths.json) ?? "{}")).toMatchObject({ generatedAt: NOW });
    expect(dependencies.logger.records[0]?.event).toBe("report_rendered");
  });

  it("renderReport without comparison results throws STORED_FILE_INVALID", async () => {
    const { cache, dependencies } = setUp();
    cache.files.delete(comparisonResultsPath("fork-base", "current"));

    const run = renderReport(dependencies, { goldenLabel: "fork-base", candidateLabel: "current" });

    await expect(run).rejects.toMatchObject({ code: HarnessErrorCode.StoredFileInvalid });
  });
});
