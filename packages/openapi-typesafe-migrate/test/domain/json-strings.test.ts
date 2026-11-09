import { describe, expect, it } from "vitest";
import { jsonStrings } from "../../src/domain/json-strings.js";

describe("jsonStrings", () => {
  it("jsonStrings finds every string value with its key path and offsets", () => {
    const text = '{"a": "x", "b": [1, "y", {"c": "z\\n"}], "d": true, "e": null, "f": -1.5e3}';

    const strings = jsonStrings(text);

    expect(strings?.map(({ path, value }) => ({ path, value }))).toEqual([
      { path: ["a"], value: "x" },
      { path: ["b", 1], value: "y" },
      { path: ["b", 2, "c"], value: "z\n" },
    ]);
    expect(text.slice(strings?.[0]?.start, strings?.[0]?.end)).toBe('"x"');
  });

  it("jsonStrings reads JSONC comments and trailing commas", () => {
    const text = '﻿// head\n{ /* a */ "tasks": { "gen": "x", }, // tail\n "list": [ "y", ], }\n';

    expect(jsonStrings(text)?.map((found) => found.value)).toEqual(["x", "y"]);
  });

  it.each([
    "",
    "{",
    '{"a" "b"}',
    '{"a": }',
    "{a: 1}",
    '{"a": "b"} x',
    '{"a": "unterminated}',
    '{"a": "bad \\q escape"}',
    "[1 2]",
    "/* open",
    "nope",
  ])("jsonStrings gives undefined for text that is not JSON: %s", (text) => {
    expect(jsonStrings(text)).toBeUndefined();
  });

  it("jsonStrings reads an empty document, object and array", () => {
    expect(jsonStrings("{}")).toEqual([]);
    expect(jsonStrings("[]")).toEqual([]);
    expect(jsonStrings('"x"')).toEqual([{ path: [], value: "x", start: 0, end: 3 }]);
  });
});
