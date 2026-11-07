import { describe, expect, it } from "vitest";
import { encodeJson } from "../../src/application/codecs.ts";
import { comparisonResultsPath, optInResultsPath } from "../../src/application/layout.ts";
import { checkGate } from "../../src/application/use-cases/check-gate.ts";
import type { CorpusEntryId } from "../../src/domain/corpus-entry.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import { OptInCheckStatus as OptIn, type OptInCheckStatus } from "../../src/domain/opt-in-check.ts";
import { ComparisonStatus } from "../../src/domain/run-result.ts";
import { InMemoryFileStore } from "../fakes/in-memory-file-store.ts";

const LABELS = { goldenLabel: "fork-base", candidateLabel: "current" };

function comparison(entryId: string, status: ComparisonStatus) {
  return {
    entryId: entryId as CorpusEntryId,
    optionSetId: "default",
    status,
    firstDifferentLine: null,
    differentLineCount: 0,
    differentTypeNames: [],
    intentionalDifferenceIds: [],
  };
}

function optInCheck(entryId: string, status: OptInCheckStatus) {
  return {
    entryId,
    optionSetId: "blob",
    baselineOptionSetId: "default",
    status,
    errorCount: null,
    baselineErrorCount: null,
  };
}

function setUp(statuses: readonly ComparisonStatus[], optIn: readonly OptInCheckStatus[] = []) {
  return new InMemoryFileStore({
    [comparisonResultsPath("fork-base", "current")]: encodeJson(
      statuses.map((status, index) => comparison(`e${index}`, status)),
    ),
    [optInResultsPath("current-opt-in")]: encodeJson(
      optIn.map((status, index) => optInCheck(`e${index}`, status)),
    ),
  });
}

describe("checkGate", () => {
  it("checkGate passes when every case matches", async () => {
    const cache = setUp([
      ComparisonStatus.Identical,
      ComparisonStatus.TypeIdentical,
      ComparisonStatus.GoldenFailed,
      ComparisonStatus.GoldenInvalid,
    ]);

    const verdict = await checkGate(cache, LABELS);

    expect(verdict).toEqual({
      comparison: { caseCount: 4, failureCount: 0 },
      optIn: null,
      isPassed: true,
    });
  });

  it("checkGate fails on mismatches and counts them", async () => {
    const cache = setUp([
      ComparisonStatus.Identical,
      ComparisonStatus.Different,
      ComparisonStatus.TypesAdded,
      ComparisonStatus.CandidateFailed,
    ]);

    const verdict = await checkGate(cache, LABELS);

    expect(verdict.comparison).toEqual({ caseCount: 4, failureCount: 3 });
    expect(verdict.isPassed).toBe(false);
  });

  it("checkGate with an opt-in label passes without regressions", async () => {
    const cache = setUp(
      [ComparisonStatus.Identical],
      [OptIn.Unchanged, OptIn.Compiles, OptIn.NoNewErrors, OptIn.BaselineFailed],
    );

    const verdict = await checkGate(cache, { ...LABELS, optInLabel: "current-opt-in" });

    expect(verdict.optIn).toEqual({ caseCount: 4, failureCount: 0 });
    expect(verdict.isPassed).toBe(true);
  });

  it("checkGate with an opt-in label fails on regressions", async () => {
    const cache = setUp(
      [ComparisonStatus.Identical],
      [OptIn.MoreErrors, OptIn.CandidateFailed, OptIn.Unchanged],
    );

    const verdict = await checkGate(cache, { ...LABELS, optInLabel: "current-opt-in" });

    expect(verdict.optIn).toEqual({ caseCount: 3, failureCount: 2 });
    expect(verdict.isPassed).toBe(false);
  });

  it("checkGate without stored results throws STORED_FILE_INVALID", async () => {
    await expect(checkGate(new InMemoryFileStore(), LABELS)).rejects.toMatchObject({
      code: HarnessErrorCode.StoredFileInvalid,
    });
    await expect(checkGate(setUp([]), { ...LABELS, optInLabel: "missing-opt-in" })).rejects.toThrow(
      /Missing results\/missing-opt-in.opt-in.json/,
    );
  });
});
