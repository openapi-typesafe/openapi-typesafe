import { describe, expect, it } from "vitest";
import { compareGeneratedTexts } from "../../src/domain/text-comparison.ts";

describe("compareGeneratedTexts", () => {
  it("compareGeneratedTexts with texts equal after normalization reports identical", () => {
    expect(compareGeneratedTexts("a\r\nb  ", "a\nb")).toEqual({
      isIdentical: true,
      firstDifferentLine: null,
      differentLineCount: 0,
    });
  });

  it("compareGeneratedTexts reports the first different line and counts changed lines", () => {
    expect(compareGeneratedTexts("a\nb\nc\nd", "a\nB\nc\nD")).toEqual({
      isIdentical: false,
      firstDifferentLine: 2,
      differentLineCount: 2,
    });
  });

  it("compareGeneratedTexts counts every extra line when lengths differ", () => {
    expect(compareGeneratedTexts("a", "a\nb\nc")).toEqual({
      isIdentical: false,
      firstDifferentLine: 2,
      differentLineCount: 2,
    });
  });
});
