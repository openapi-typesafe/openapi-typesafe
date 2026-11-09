import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";

const reader = createYamlTextReader();

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The key path and the text as written of each string scalar. */
function found(text: string): [string, string][] {
  return (reader.strings(text) ?? []).map((string) => [
    string.path.join("."),
    text.slice(string.start, string.end),
  ]);
}

describe("YamlTextReader", () => {
  it("strings finds plain and quoted values, also in list items and with quoted keys", () => {
    const text = lines(
      "run: a b # note",
      "steps:",
      '  - run: "c d"',
      "  - 'run': 'e'",
      "  - name: x",
      "    run: f",
    );

    expect(found(text)).toEqual([
      ["run", "a b"],
      ["steps.0.run", "c d"],
      ["steps.1.run", "e"],
      ["steps.2.name", "x"],
      ["steps.2.run", "f"],
    ]);
  });

  it("strings finds block scalars without their header line and trailing blank lines", () => {
    const text = lines(
      "run: | # a comment",
      "  a \\",
      "    -b",
      "",
      "  c",
      "",
      "next: x",
      "fold: >-",
      "  d",
      "  e",
    );

    const strings = reader.strings(text) ?? [];

    expect(strings.map((value) => text.slice(value.start, value.end))).toEqual([
      "  a \\\n    -b\n\n  c",
      "x",
      "  d\n  e",
    ]);
    expect(strings.map((value) => value.isFolded)).toEqual([false, true, true]);
  });

  it("strings finds block scalars of a file with CRLF line ends", () => {
    const text = "run: |+\r\n  a\r\n\r\nnext: b\r\n";

    expect(found(text)).toEqual([
      ["run", "  a"],
      ["next", "b"],
    ]);
  });

  it("strings finds the items of flow collections, also inside block ones", () => {
    const text = lines(
      "run: [a, 'b c', \"d\"]",
      "job: {run: e, script: [f]}",
      "steps:",
      "  - {name: x, run: g}",
    );

    expect(found(text)).toEqual([
      ["run.0", "a"],
      ["run.1", "b c"],
      ["run.2", "d"],
      ["job.run", "e"],
      ["job.script.0", "f"],
      ["steps.0.name", "x"],
      ["steps.0.run", "g"],
    ]);
  });

  it("strings finds the items of nested lists and of every document of a stream", () => {
    const text = lines("script:", "- a", "- - b", "---", "run: c");

    expect(found(text)).toEqual([
      ["script.0", "a"],
      ["script.1.0", "b"],
      ["run", "c"],
    ]);
  });

  it("strings skips keys, values that are not strings, and values below a complex key", () => {
    const text = lines("a: 1", "b: true", "c:", "d: *x", "? [k]", ": v", "e: &x y");

    expect(found(text)).toEqual([["e", "y"]]);
  });

  it("strings tells where folded scalars fold their line breaks", () => {
    const text = lines("plain: a", "  b", 'quoted: "c', '  d"', "literal: |", "  e");

    expect(reader.strings(text)?.map((value) => [value.value, value.isFolded])).toEqual([
      ["a b", true],
      ["c d", true],
      ["e\n", false],
    ]);
  });

  it.each([
    lines("run: 'open"),
    lines("run: a", "run: b"),
    lines("scripts:", "  gen: a", "  - stray"),
    lines("run: [a, b"),
  ])("strings gives undefined for text that is not valid YAML: %s", (text) => {
    expect(reader.strings(text)).toBeUndefined();
  });

  it("strings reads an empty stream", () => {
    expect(reader.strings("")).toEqual([]);
    expect(reader.strings("# only a comment\n")).toEqual([]);
  });
});
