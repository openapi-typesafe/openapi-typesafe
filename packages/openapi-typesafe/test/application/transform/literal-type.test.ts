import { describe, expect, it } from "vitest";
import { printNodes } from "../../../src/application/print/print-nodes.js";
import { literalType } from "../../../src/application/transform/literal-type.js";

function printType(value: unknown): string {
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type: literalType(value) }]).slice("type T = ".length, -2);
}

describe("literalType", () => {
  it.each([
    ["é\n", '"é\\n"'],
    [-1.5, "-1.5"],
    [0, "0"],
    [true, "true"],
    [false, "false"],
    [null, "null"],
    [[], "never[]"],
    [{}, "Record<string, never>"],
    [undefined, "unknown"],
    [Number.NaN, "NaN"],
    [Number.NEGATIVE_INFINITY, "-Infinity"],
  ])("literalType(%j) prints %s", (value, text) => {
    expect(printType(value)).toBe(text);
  });

  it("literalType of an array is a tuple of literal types", () => {
    expect(printType(["a", 1, [null]])).toBe('[\n    "a",\n    1,\n    [\n        null\n    ]\n]');
  });

  it("literalType of an object quotes keys only when needed", () => {
    expect(printType({ id: 1, "content-type": "x", 7: true })).toBe(
      '{\n    7: true;\n    id: 1;\n    "content-type": "x";\n}',
    );
  });
});
