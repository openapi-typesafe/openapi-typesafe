import { describe, expect, it } from "vitest";
import type { CorpusEntryId } from "../../src/domain/corpus-entry.ts";
import {
  type ComparisonResult,
  ComparisonStatus,
  summarizeComparisons,
} from "../../src/domain/run-result.ts";

function comparison(status: ComparisonStatus): ComparisonResult {
  return {
    entryId: "entry" as CorpusEntryId,
    optionSetId: "default",
    status,
    firstDifferentLine: null,
    differentLineCount: 0,
    differentTypeNames: [],
  };
}

describe("summarizeComparisons", () => {
  it("summarizeComparisons counts every status and excludes golden failures from the rates", () => {
    const summary = summarizeComparisons([
      comparison(ComparisonStatus.Identical),
      comparison(ComparisonStatus.TypeIdentical),
      comparison(ComparisonStatus.Different),
      comparison(ComparisonStatus.CandidateFailed),
      comparison(ComparisonStatus.GoldenFailed),
    ]);

    expect(summary.total).toBe(5);
    expect(summary.byStatus).toEqual({
      identical: 1,
      "type-identical": 1,
      different: 1,
      "golden-failed": 1,
      "candidate-failed": 1,
    });
    expect(summary.byteIdentityRate).toBe(0.25);
    expect(summary.typeIdentityRate).toBe(0.5);
  });

  it("summarizeComparisons with no comparable cases reports full rates", () => {
    const summary = summarizeComparisons([comparison(ComparisonStatus.GoldenFailed)]);

    expect(summary.byteIdentityRate).toBe(1);
    expect(summary.typeIdentityRate).toBe(1);
  });
});
