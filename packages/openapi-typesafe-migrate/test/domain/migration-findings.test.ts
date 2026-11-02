import { describe, expect, it } from "vitest";
import { lineAt, unchanged } from "../../src/domain/migration-findings.js";

describe("lineAt", () => {
  it("lineAt counts the line breaks before an offset", () => {
    const text = "a\nbb\nccc";

    expect([0, 1, 2, 4, 5, 8].map((offset) => lineAt(text, offset))).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("unchanged", () => {
  it("unchanged keeps the text with no findings", () => {
    expect(unchanged("x")).toEqual({ text: "x", changes: [], manualSteps: [] });
  });
});
