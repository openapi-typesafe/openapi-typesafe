import { describe, expect, it } from "vitest";
import type { CorpusEntryId } from "../../src/domain/corpus-entry.ts";
import {
  type ComparisonResult,
  ComparisonStatus,
  isComparisonMismatch,
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
    intentionalDifferenceIds: [],
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
      "types-added": 0,
      different: 1,
      "golden-failed": 1,
      "golden-invalid": 0,
      "candidate-failed": 1,
    });
    expect(summary.byteIdentityRate).toBe(0.25);
    expect(summary.typeIdentityRate).toBe(0.5);
  });

  it("summarizeComparisons with no comparable cases reports full rates", () => {
    const summary = summarizeComparisons([comparison(ComparisonStatus.GoldenFailed)]);

    expect(summary.byteIdentityRate).toBe(1);
    expect(summary.typeIdentityRate).toBe(1);
    expect(summary.keptTypeRate).toBe(1);
  });

  it("summarizeComparisons leaves golden output that does not compile out of the rates", () => {
    const summary = summarizeComparisons([
      comparison(ComparisonStatus.Identical),
      comparison(ComparisonStatus.GoldenInvalid),
    ]);

    expect(summary.byteIdentityRate).toBe(1);
    expect(summary.typeIdentityRate).toBe(1);
  });

  it("summarizeComparisons counts added types as kept, but not as type identity", () => {
    const summary = summarizeComparisons([
      comparison(ComparisonStatus.TypeIdentical),
      comparison(ComparisonStatus.TypesAdded),
      comparison(ComparisonStatus.Different),
      comparison(ComparisonStatus.Different),
    ]);

    expect(summary.typeIdentityRate).toBe(0.25);
    expect(summary.keptTypeRate).toBe(0.5);
  });
});

describe("isComparisonMismatch", () => {
  it.each([
    [ComparisonStatus.Identical, false],
    [ComparisonStatus.TypeIdentical, false],
    [ComparisonStatus.GoldenFailed, false],
    [ComparisonStatus.GoldenInvalid, false],
    [ComparisonStatus.TypesAdded, true],
    [ComparisonStatus.Different, true],
    [ComparisonStatus.CandidateFailed, true],
  ])("isComparisonMismatch of %s is %s", (status, expected) => {
    expect(isComparisonMismatch(status)).toBe(expected);
  });
});
