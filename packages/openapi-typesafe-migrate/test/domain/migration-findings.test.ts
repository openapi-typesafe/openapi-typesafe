import { describe, expect, it } from "vitest";
import { lineAt, lineLocator, unchanged } from "../../src/domain/migration-findings.js";

describe("lineAt", () => {
  it("lineAt counts the line breaks before an offset", () => {
    const text = "a\nbb\nccc";

    expect([0, 1, 2, 4, 5, 8].map((offset) => lineAt(text, offset))).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("lineLocator", () => {
  it("lineLocator gives the line of lineAt for every offset", () => {
    const text = "a\nbb\n\nccc\n";
    const lineOf = lineLocator(text);

    const offsets = Array.from({ length: text.length + 1 }, (_, offset) => offset);

    expect(offsets.map(lineOf)).toEqual(offsets.map((offset) => lineAt(text, offset)));
    expect(lineLocator("")(0)).toBe(1);
  });
});

describe("unchanged", () => {
  it("unchanged keeps the text with no findings", () => {
    expect(unchanged("x")).toEqual({ text: "x", changes: [], manualSteps: [] });
  });
});
