import { describe, expect, it } from "vitest";
import { encodeJson } from "../../src/application/codecs.ts";
import {
  comparisonResultsPath,
  DEPENDENTS_RESULTS_PATH,
  generationResultsPath,
  reportPaths,
} from "../../src/application/layout.ts";
import { buildCompatibilityReport, type ReportInput } from "../../src/application/report.ts";
import { renderMarkdownReport } from "../../src/application/report-markdown.ts";
import { renderReport } from "../../src/application/use-cases/render-report.ts";
import type { CorpusEntryId } from "../../src/domain/corpus-entry.ts";
import {
  type DependentResult,
  DependentStatus,
  GeneratedFileStatus,
  StepStatus,
} from "../../src/domain/dependent-result.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import type { IntentionalDifference } from "../../src/domain/intentional-differences.ts";
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
  const base = {
    firstDifferentLine: null,
    differentLineCount: 0,
    differentTypeNames: [],
    intentionalDifferenceIds: [],
  };
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
  intentionalDifferences: [],
};

const FIX: IntentionalDifference = {
  id: "fix",
  issues: ["owner/repo#1"],
  description: "x becomes y",
  golden: /^x$/gm,
  candidate: "y",
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

describe("buildCompatibilityReport with intentional differences", () => {
  it("buildCompatibilityReport lists every catalog entry with the cases it applied to", () => {
    const comparisons = [
      comparison("a", ComparisonStatus.Identical, { intentionalDifferenceIds: ["fix"] }),
      comparison("b", ComparisonStatus.Identical),
    ];
    const unused = { ...FIX, id: "unused" };

    const report = buildCompatibilityReport({
      ...INPUT,
      comparisons,
      intentionalDifferences: [FIX, unused],
    });

    expect(report.intentionalDifferences).toEqual([
      {
        id: "fix",
        issues: ["owner/repo#1"],
        description: "x becomes y",
        caseCount: 1,
        examples: ["default/a"],
      },
      {
        id: "unused",
        issues: ["owner/repo#1"],
        description: "x becomes y",
        caseCount: 0,
        examples: [],
      },
    ]);
  });

  it("renderMarkdownReport renders the intentional differences table", () => {
    const comparisons = [
      comparison("a", ComparisonStatus.Identical, { intentionalDifferenceIds: ["fix"] }),
    ];
    const report = buildCompatibilityReport({
      ...INPUT,
      comparisons,
      intentionalDifferences: [FIX],
    });

    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("## Intentional differences");
    expect(markdown).toContain("| fix | x becomes y | owner/repo#1 | 1 | default/a |");
  });

  it("renderMarkdownReport says None without intentional differences", () => {
    expect(renderMarkdownReport(buildCompatibilityReport(INPUT))).toContain(
      "## Intentional differences\n\nBug fixes",
    );
  });
});

describe("renderMarkdownReport", () => {
  it("renderMarkdownReport renders the summary, option sets and escaped failure table", () => {
    const markdown = renderMarkdownReport(buildCompatibilityReport(INPUT));

    expect(markdown).toContain("# Compatibility report: current vs fork-base");
    expect(markdown).toContain("| all | 7 | 1 | 1 | 0 | 2 | 1 | 2 | 16.67% | 33.33% | 33.33% |");
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

const DEPENDENT: DependentResult = {
  projectId: "demo",
  repository: "https://github.com/owner/demo",
  commit: "0123456789abcdef0123456789abcdef01234567",
  status: DependentStatus.Regressed,
  failedStep: "test",
  baseline: [],
  candidate: [
    { name: "install", status: StepStatus.Passed, durationMs: 1, outputExcerpt: "" },
    { name: "test", status: StepStatus.Failed, durationMs: 1, outputExcerpt: "boom" },
  ],
  generatedFiles: [
    {
      path: "a.ts",
      status: GeneratedFileStatus.Identical,
      firstDifferentLine: null,
      differentLineCount: 0,
      intentionalDifferenceIds: [],
    },
  ],
};

describe("real projects in the report", () => {
  it("buildCompatibilityReport without dependents reports them as not run", () => {
    const report = buildCompatibilityReport(INPUT);

    expect(report.dependents).toBeNull();
    expect(renderMarkdownReport(report)).toContain("## Real projects");
    expect(renderMarkdownReport(report)).toContain("Not run. Run `pnpm harness dependents`");
  });

  it("renderMarkdownReport lists every dependent with its verdict and step counts", () => {
    const report = buildCompatibilityReport({ ...INPUT, dependents: [DEPENDENT] });

    const markdown = renderMarkdownReport(report);

    expect(report.dependents?.summary).toMatchObject({ total: 1, regressed: 1 });
    expect(markdown).toContain("1 projects: 0 passed, 1 regressed, 0 failed before the switch.");
    expect(markdown).toContain(
      "| [demo](https://github.com/owner/demo) | `0123456789ab` | regressed | test | 1/2 | 1/1 |",
    );
  });

  it("renderMarkdownReport leaves the failed step empty for a passed dependent", () => {
    const passed = { ...DEPENDENT, status: DependentStatus.Passed, failedStep: null };

    const markdown = renderMarkdownReport(
      buildCompatibilityReport({ ...INPUT, dependents: [passed] }),
    );

    expect(markdown).toContain("| passed |  | 1/2 |");
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

  it("renderReport includes the stored dependent results", async () => {
    const { cache, dependencies } = setUp();
    cache.files.set(DEPENDENTS_RESULTS_PATH, encodeJson([DEPENDENT]));

    const report = await renderReport(dependencies, {
      goldenLabel: "fork-base",
      candidateLabel: "current",
    });

    expect(report.dependents?.results).toEqual([DEPENDENT]);
  });

  it("renderReport without comparison results throws STORED_FILE_INVALID", async () => {
    const { cache, dependencies } = setUp();
    cache.files.delete(comparisonResultsPath("fork-base", "current"));

    const run = renderReport(dependencies, { goldenLabel: "fork-base", candidateLabel: "current" });

    await expect(run).rejects.toMatchObject({ code: HarnessErrorCode.StoredFileInvalid });
  });
});
