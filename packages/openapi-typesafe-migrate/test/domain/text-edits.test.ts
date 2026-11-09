import { describe, expect, it } from "vitest";
import { applyTextEdits } from "../../src/domain/text-edits.js";

describe("applyTextEdits", () => {
  it("applyTextEdits applies edits in offset order, whatever order they come in", () => {
    const edits = [
      { start: 6, end: 11, text: "there" },
      { start: 0, end: 5, text: "Hi" },
    ];

    expect(applyTextEdits("hello world!", edits)).toBe("Hi there!");
  });

  it("applyTextEdits applies an insertion at the end of the text", () => {
    const edits = [
      { start: 0, end: 1, text: "A" },
      { start: 4, end: 4, text: "!" },
      { start: 2, end: 3, text: "C" },
    ];

    expect(applyTextEdits("abcd", edits)).toBe("AbCd!");
  });

  it("applyTextEdits gives the text back without edits", () => {
    expect(applyTextEdits("same", [])).toBe("same");
  });

  it("applyTextEdits refuses edits that overlap", () => {
    const edits = [
      { start: 0, end: 4, text: "a" },
      { start: 2, end: 5, text: "b" },
    ];

    expect(() => applyTextEdits("abcd", edits)).toThrow(/overlap at offset 2/);
  });
});
