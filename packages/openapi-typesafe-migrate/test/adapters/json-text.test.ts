import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";

const reader = createJsonTextReader();

describe("JsonTextReader", () => {
  it("strings finds every string value with its key path and offsets", () => {
    const text = '{"a": "x", "b": [1, "y", {"c": "z\\n"}], "d": true, "e": null, "f": -1.5e3}';

    const strings = reader.strings(text);

    expect(strings?.map(({ path, value }) => ({ path, value }))).toEqual([
      { path: ["a"], value: "x" },
      { path: ["b", 1], value: "y" },
      { path: ["b", 2, "c"], value: "z\n" },
    ]);
    expect(text.slice(strings?.[0]?.start, strings?.[0]?.end)).toBe('"x"');
  });

  it("strings reads JSONC comments and trailing commas", () => {
    const text = '﻿// head\n{ /* a */ "tasks": { "gen": "x", }, // tail\n "list": [ "y", ], }\n';

    const strings = reader.strings(text);

    expect(strings?.map((found) => found.value)).toEqual(["x", "y"]);
    expect(strings?.map((found) => text.slice(found.start, found.end))).toEqual(['"x"', '"y"']);
  });

  it("strings gives offsets past a comment between a key and its value", () => {
    const text = '{\n  "gen": /* the generator */ "openapi-typescript a"\n}\n';

    const [found] = reader.strings(text) ?? [];

    expect(text.slice(found?.start, found?.end)).toBe('"openapi-typescript a"');
  });

  it.each([
    "{",
    '{"a" "b"}',
    '{"a": }',
    "{a: 1}",
    "{'a': 'b'}",
    '{"a": "b"} x',
    '{"a": "unterminated}',
    '{"a": `x`}',
    "[1 2]",
    '"x"',
    "/* open",
    "nope",
  ])("strings gives undefined for text that is not a JSON object document: %s", (text) => {
    expect(reader.strings(text)).toBeUndefined();
  });

  it("strings reads an empty text and an empty object", () => {
    expect(reader.strings("")).toEqual([]);
    expect(reader.strings("{}")).toEqual([]);
  });
});
