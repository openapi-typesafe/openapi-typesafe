import { describe, expect, it } from "vitest";
import { applyTextEdits } from "../../src/domain/text-edits.js";

describe("applyTextEdits", () => {
  it("applyTextEdits applies edits in any order, also insertions at the same place", () => {
    const edits = [
      { start: 0, end: 1, text: "A" },
      { start: 4, end: 4, text: "!" },
      { start: 2, end: 3, text: "C" },
    ];

    expect(applyTextEdits("abcd", edits)).toBe("AbCd!");
  });

  it("applyTextEdits throws on overlapping edits", () => {
    const edits = [
      { start: 0, end: 2, text: "" },
      { start: 1, end: 3, text: "" },
    ];

    expect(() => applyTextEdits("abcd", edits)).toThrow("Text edits overlap at offset 0");
  });
});
