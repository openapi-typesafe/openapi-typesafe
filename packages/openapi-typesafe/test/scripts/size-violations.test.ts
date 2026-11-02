import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  findDeepNesting,
  findLongLines,
  findSizeViolations,
  SIZE_LIMITS,
} from "../../scripts/size-rules/size-violations.js";

function nestingOf(text: string): number[] {
  return findDeepNesting(ts, { fileName: "probe.ts", text }, 2).map((violation) => violation.line);
}

describe("findLongLines", () => {
  it("findLongLines with a line over the limit reports its line number and length", () => {
    const text = ["short", "x".repeat(11), "y".repeat(10)].join("\n");

    const violations = findLongLines(text, 10);

    expect(violations).toEqual([{ line: 2, message: "line has 11 characters (max 10)" }]);
  });

  it("findLongLines with CRLF line ends does not count the carriage return", () => {
    expect(findLongLines("abc\r\nabcd\r\n", 4)).toEqual([]);
  });
});

describe("findDeepNesting", () => {
  it("findDeepNesting with statements nested past the limit reports the first too-deep line", () => {
    const text = [
      "function f(a: number[]) {",
      "  for (const x of a) {",
      "    if (x) {",
      "      while (x) {",
      "        try {} catch {}",
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n");

    expect(nestingOf(text)).toEqual([4, 5]);
  });

  it("findDeepNesting with an else-if chain counts the chain as one level", () => {
    const text = [
      "function f(x: number) {",
      "  if (x === 1) {",
      "  } else if (x === 2) {",
      "    switch (x) {}",
      "  } else if (x === 3) {",
      "  }",
      "}",
    ].join("\n");

    expect(nestingOf(text)).toEqual([]);
  });

  it("findDeepNesting with a nested function starts that function at depth 0", () => {
    const text = [
      "function f(a: number[]) {",
      "  for (const x of a) {",
      "    if (x) {",
      "      a.forEach((y) => { if (y) { for (;;) {} } });",
      "    }",
      "  }",
      "}",
    ].join("\n");

    expect(nestingOf(text)).toEqual([]);
  });

  it("findDeepNesting with an else block nested deeper reports it", () => {
    const text = [
      "function f(x: number) {",
      "  if (x) {",
      "  } else {",
      "    if (x > 1) {",
      "      do {} while (x);",
      "    }",
      "  }",
      "}",
    ].join("\n");

    expect(nestingOf(text)).toEqual([5]);
  });
});

describe("findSizeViolations", () => {
  it("findSizeViolations returns both kinds of violation ordered by line", () => {
    const deep = "if (a) { if (b) { if (c) { if (d) {} } } }";
    const text = [`// ${"x".repeat(SIZE_LIMITS.maxLineLength)}`, deep].join("\n");

    const violations = findSizeViolations(ts, { fileName: "probe.ts", text }, SIZE_LIMITS);

    expect(violations.map((violation) => violation.line)).toEqual([1, 2]);
    expect(violations[1]?.message).toBe("nesting depth 4 (max 3)");
  });
});
