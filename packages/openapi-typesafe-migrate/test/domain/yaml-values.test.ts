import { describe, expect, it } from "vitest";
import { yamlMappingEntries, yamlValues } from "../../src/domain/yaml-values.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The text of each value of `keys`. */
const found = (text: string, ...keys: string[]): string[] =>
  yamlValues(text, new Set(keys)).map((value) => text.slice(value.start, value.end));

describe("yamlValues", () => {
  it("yamlValues finds plain and quoted values, also in list items and with quoted keys", () => {
    const text = lines(
      "run: a b # note",
      "steps:",
      '  - run: "c d"',
      "  - 'run': 'e'",
      "  - name: x",
      "    run: f",
    );

    expect(found(text, "run")).toEqual(["a b", "c d", "e", "f"]);
  });

  it("yamlValues finds block scalars without their indicator line and trailing blank lines", () => {
    const text = lines(
      "run: |",
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

    const values = yamlValues(text, new Set(["run", "fold"]));

    expect(values.map((value) => text.slice(value.start, value.end))).toEqual([
      "  a \\\n    -b\n\n  c",
      "  d\n  e",
    ]);
    expect(values.map((value) => value.isFolded)).toEqual([false, true]);
  });

  it("yamlValues finds the scalar items of a list, at the key's indentation too", () => {
    const text = lines("script:", "- a", "  - b", "-", "- |", "  c", "- k: v", "after: z");

    expect(found(text, "script")).toEqual(["a", "b", "  c"]);
  });

  it("yamlValues skips block scalars of other keys, so their text is never read as keys", () => {
    const text = lines("description: |", "  run: no", "- |", "  run: no", "run: yes");

    expect(found(text, "run")).toEqual(["yes"]);
  });

  it("yamlValues skips flow collections, empty block scalars and unclosed quotes", () => {
    const text = lines("run: [a, b]", "run: {a: b}", "run: |", "run: 'open", "run:");

    expect(found(text, "run")).toEqual([""]);
  });
});

describe("yamlMappingEntries", () => {
  it("yamlMappingEntries finds the values of a top-level mapping by key", () => {
    const text = lines(
      "name: p",
      "scripts:",
      "  gen: a b",
      "  multi: |",
      "    c",
      "  # note",
      "  - stray",
      "other:",
      "  gen: no",
    );

    const entries = yamlMappingEntries(text, "scripts");

    expect(
      entries.map((entry) => [entry.key, text.slice(entry.value.start, entry.value.end)]),
    ).toEqual([
      ["gen", "a b"],
      ["multi", "    c"],
    ]);
  });

  it("yamlMappingEntries finds nothing without the top-level key", () => {
    expect(yamlMappingEntries("nested:\n  scripts:\n    gen: a\n", "scripts")).toEqual([]);
  });
});
