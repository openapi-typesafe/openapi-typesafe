import { describe, expect, it } from "vitest";
import type { CorpusEntryId } from "../../src/domain/corpus-entry.ts";
import {
  isOptInRegression,
  type OptInCheckResult,
  OptInCheckStatus,
  summarizeOptInChecks,
} from "../../src/domain/opt-in-check.ts";

function check(optionSetId: string, status: OptInCheckStatus): OptInCheckResult {
  return {
    entryId: "entry" as CorpusEntryId,
    optionSetId,
    baselineOptionSetId: "default",
    status,
    errorCount: null,
    baselineErrorCount: null,
  };
}

describe("isOptInRegression", () => {
  it.each([
    [OptInCheckStatus.Unchanged, false],
    [OptInCheckStatus.Compiles, false],
    [OptInCheckStatus.NoNewErrors, false],
    [OptInCheckStatus.BaselineFailed, false],
    [OptInCheckStatus.MoreErrors, true],
    [OptInCheckStatus.CandidateFailed, true],
  ])("isOptInRegression with %s returns %s", (status, expected) => {
    expect(isOptInRegression(status)).toBe(expected);
  });
});

describe("summarizeOptInChecks", () => {
  it("summarizeOptInChecks counts every status per option set", () => {
    const summary = summarizeOptInChecks([
      check("a", OptInCheckStatus.Unchanged),
      check("a", OptInCheckStatus.Unchanged),
      check("b", OptInCheckStatus.MoreErrors),
      check("a", OptInCheckStatus.Compiles),
    ]);

    expect([...summary.keys()]).toEqual(["a", "b"]);
    expect(summary.get("a")).toMatchObject({ unchanged: 2, compiles: 1, "more-errors": 0 });
    expect(summary.get("b")).toMatchObject({ unchanged: 0, "more-errors": 1 });
  });
});
