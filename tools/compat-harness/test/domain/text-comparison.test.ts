import { describe, expect, it } from "vitest";
import type { IntentionalDifference } from "../../src/domain/intentional-differences.ts";
import { compareGeneratedTexts } from "../../src/domain/text-comparison.ts";

const FIX: IntentionalDifference = {
  id: "fix",
  issues: ["owner/repo#1"],
  description: "x becomes y",
  golden: /^x$/gm,
  candidate: "y",
};

describe("compareGeneratedTexts", () => {
  it("compareGeneratedTexts with texts equal after normalization reports identical", () => {
    expect(compareGeneratedTexts("a\r\nb  ", "a\nb")).toEqual({
      isIdentical: true,
      firstDifferentLine: null,
      differentLineCount: 0,
      intentionalDifferenceIds: [],
    });
  });

  it("compareGeneratedTexts reports the first different line and counts changed lines", () => {
    expect(compareGeneratedTexts("a\nb\nc\nd", "a\nB\nc\nD")).toEqual({
      isIdentical: false,
      firstDifferentLine: 2,
      differentLineCount: 2,
      intentionalDifferenceIds: [],
    });
  });

  it("compareGeneratedTexts counts every extra line when lengths differ", () => {
    expect(compareGeneratedTexts("a", "a\nb\nc")).toEqual({
      isIdentical: false,
      firstDifferentLine: 2,
      differentLineCount: 2,
      intentionalDifferenceIds: [],
    });
  });

  it("compareGeneratedTexts rewrites the golden text with the intentional differences first", () => {
    expect(compareGeneratedTexts("a\nx", "a\ny", [FIX])).toEqual({
      isIdentical: true,
      firstDifferentLine: null,
      differentLineCount: 0,
      intentionalDifferenceIds: ["fix"],
    });
  });
});
