import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import {
  type DocumentString,
  documentStrings,
  type TreeMap,
  type TreeNode,
  type TreeScalar,
} from "../../src/domain/config-documents.js";

const reader = createYamlTextReader();

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The string values of a stream, or undefined when it cannot be read. */
function stringsOf(text: string): DocumentString[] | undefined {
  const read = reader.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : undefined;
}

/** The key path and the text as written of each string scalar. */
function found(text: string): [string, string][] {
  return (stringsOf(text) ?? []).map((string) => [
    string.path.join("."),
    text.slice(string.content.start, string.content.end),
  ]);
}

function rootOf(text: string): TreeNode {
  const read = reader.read(text);
  const [root] = read.kind === "read" ? read.documents : [];
  if (root === undefined) {
    throw new Error(`expected ${text} to be read`);
  }
  return root;
}

/** The value of the first entry of a mapping. */
function firstValue(text: string): TreeNode {
  const value = (rootOf(text) as TreeMap).entries[0]?.value;
  if (value === undefined) {
    throw new Error(`expected ${text} to have an entry`);
  }
  return value;
}

function scalarOf(node: TreeNode): TreeScalar {
  if (node.kind !== "scalar") {
    throw new Error(`expected a scalar, got ${node.kind}`);
  }
  return node;
}

describe("YamlTextReader strings", () => {
  it("read finds plain and quoted values, also in list items and with quoted keys", () => {
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

  it("read finds block scalars without their header line and trailing blank lines", () => {
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

    const strings = stringsOf(text) ?? [];

    expect(strings.map((value) => text.slice(value.content.start, value.content.end))).toEqual([
      "  a \\\n    -b\n\n  c",
      "x",
      "  d\n  e",
    ]);
    expect(strings.map((value) => value.isFolded)).toEqual([false, true, true]);
  });

  it("read finds block scalars of a file with CRLF line ends", () => {
    const text = "run: |+\r\n  a\r\n\r\nnext: b\r\n";

    expect(found(text)).toEqual([
      ["run", "  a"],
      ["next", "b"],
    ]);
  });

  it("read finds the items of flow collections, also inside block ones", () => {
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

  it("read finds the items of nested lists and of every document of a stream", () => {
    const text = lines("script:", "- a", "- - b", "---", "run: c");

    expect(found(text)).toEqual([
      ["script.0", "a"],
      ["script.1.0", "b"],
      ["run", "c"],
    ]);
  });

  it("read skips keys, empty values, aliases and values below a complex key", () => {
    const text = lines("a: 1", "b: true", "c:", "d: *x", "? [k]", ": v", "e: &x y");

    // A plain number or boolean is read as written: a version (`7`) is text to the migration.
    expect(found(text)).toEqual([
      ["a", "1"],
      ["b", "true"],
      ["e", "y"],
    ]);
  });

  it("read tells where folded scalars fold their line breaks", () => {
    const text = lines("plain: a", "  b", 'quoted: "c', '  d"', "literal: |", "  e");

    expect(stringsOf(text)?.map((value) => [value.value, value.isFolded])).toEqual([
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
  ])("read refuses text that is not valid YAML: %s", (text) => {
    expect(reader.read(text).kind).toBe("unreadable");
  });

  it("read reads an empty stream", () => {
    expect(stringsOf("")).toEqual([]);
    expect(stringsOf("# only a comment\n")).toEqual([]);
  });
});

describe("YamlTextReader tree", () => {
  it("read gives the offsets of keys and values, without quotes in the value", () => {
    const text = "x:\r\n  \"k\" : 'v' # c\r\n  n: ^7 || ^8\r\n";

    const map = firstValue(text) as TreeMap;
    const source = ({ start, end }: { start: number; end: number }) => text.slice(start, end);

    expect(map.entries.map(({ key, value }) => `${source(key)}=${source(value)}`)).toEqual([
      "\"k\"='v'",
      "n=^7 || ^8",
    ]);
    expect(map.entries.map(({ value }) => scalarOf(value).value)).toEqual(["v", "^7 || ^8"]);
  });

  it("read keeps a plain scalar as written, not as the number YAML reads", () => {
    expect(scalarOf(firstValue("a: 1.10\n")).value).toBe("1.10");
  });

  it("read reads flow and block collections", () => {
    const root = rootOf("a: { b: [c, d] }\ne:\n  - f\n");

    expect(root).toMatchObject({
      kind: "map",
      entries: [
        { value: { kind: "map", entries: [{ value: { kind: "list", items: [{}, {}] } }] } },
        { value: { kind: "list", items: [{ kind: "scalar", value: "f" }] } },
      ],
    });
  });

  it.each(["a: |\n  text\n", "a: &anchor x\nb: *anchor\n", "a: !!str 1\n"])(
    "read gives the value of %j as a scalar that a new value cannot replace",
    (text) => {
      expect(firstValue(text)).toMatchObject({ kind: "scalar", encode: undefined });
    },
  );

  it("read gives an empty value as an other node", () => {
    expect(firstValue("a:\n").kind).toBe("other");
  });

  it("read gives an alias as an other node", () => {
    const root = rootOf("a: &anchor x\nb: *anchor\n") as TreeMap;

    expect(root.entries[1]?.value.kind).toBe("other");
  });

  it("read allows a byte order mark", () => {
    expect(rootOf("\uFEFFa: x\n")).toMatchObject({ kind: "map", entries: [{ key: { start: 1 } }] });
  });

  it("read gives every document of a stream", () => {
    const read = reader.read("a: 1\n---\nb: 2\n");

    expect(read.kind === "read" && read.documents.map((document) => document.kind)).toEqual([
      "map",
      "map",
    ]);
  });

  it.each([
    ["a: [\n", 5],
    ["a: 1\na: 2\n", 5],
  ])("read refuses %j at offset %i", (text, offset) => {
    expect(reader.read(text)).toEqual({ kind: "unreadable", offset });
  });

  it("read refuses nesting deeper than the stack allows, as an error", () => {
    expect(reader.read(`a: ${"[".repeat(20_000)}${"]".repeat(20_000)}\n`).kind).toBe("unreadable");
  });
});

describe("TreeScalar.encode of the YAML reader", () => {
  it.each([
    ["a: x\n", "^1.0.0", "^1.0.0"],
    ["a: x\n", "^1 || ^2", "^1 || ^2"],
    ["a: x\n", "a: b", "'a: b'"],
    ["a: x\n", "x #y", "'x #y'"],
    ["a: x\n", "true", "'true'"],
    ["a: x\n", "1.10", "'1.10'"],
    ["a: x\n", "*", "'*'"],
    ["a: x\n", "a\nb", '"a\\nb"'],
    ["a: 'x'\n", "it's", "'it''s'"],
    ['a: "x"\n', "plain", '"plain"'],
    ["a: [x]\n", "a,b", "'a,b'"],
    ["a: { b: x }\n", "c]", "'c]'"],
  ])("encode at the value of %j writes %j as %s", (text, value, written) => {
    const node = firstValue(text);
    const scalar = node.kind === "scalar" ? node : firstOf(node);

    expect(scalar.encode?.(value)).toBe(written);
  });
});

/** The first scalar inside a flow collection. */
function firstOf(node: TreeNode): TreeScalar {
  if (node.kind === "list") {
    return scalarOf(node.items[0] as TreeNode);
  }
  return scalarOf((node as TreeMap).entries[0]?.value as TreeNode);
}
