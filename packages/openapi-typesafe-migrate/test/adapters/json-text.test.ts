import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import {
  type DocumentString,
  documentStrings,
  type TreeMap,
  type TreeNode,
} from "../../src/domain/config-documents.js";

const reader = createJsonTextReader();

/** The string values of a document, or undefined when it cannot be read. */
function stringsOf(text: string): DocumentString[] | undefined {
  const read = reader.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : undefined;
}

function rootOf(text: string): TreeNode {
  const read = reader.read(text);
  const [root] = read.kind === "read" ? read.documents : [];
  if (root === undefined) {
    throw new Error(`expected ${text} to be read`);
  }
  return root;
}

/** Each entry of a map as `key=value` source text. */
function entriesOf(text: string): string[] {
  const root = rootOf(text) as TreeMap;
  const source = ({ start, end }: { start: number; end: number }) => text.slice(start, end);
  return root.entries.map(({ key, value }) => `${source(key)}=${source(value)}`);
}

describe("JsonTextReader strings", () => {
  it("read finds every string value with its key path and offsets", () => {
    const text = '{"a": "x", "b": [1, "y", {"c": "z\\n"}], "d": true, "e": null, "f": -1.5e3}';

    const strings = stringsOf(text);

    expect(strings?.map(({ path, value }) => ({ path, value }))).toEqual([
      { path: ["a"], value: "x" },
      { path: ["b", 1], value: "y" },
      { path: ["b", 2, "c"], value: "z\n" },
    ]);
    expect(text.slice(strings?.[0]?.start, strings?.[0]?.end)).toBe('"x"');
    expect(text.slice(strings?.[0]?.content.start, strings?.[0]?.content.end)).toBe("x");
  });

  it("read reads JSONC comments and trailing commas", () => {
    const text = '﻿// head\n{ /* a */ "tasks": { "gen": "x", }, // tail\n "list": [ "y", ], }\n';

    const strings = stringsOf(text);

    expect(strings?.map((found) => found.value)).toEqual(["x", "y"]);
    expect(strings?.map((found) => text.slice(found.start, found.end))).toEqual(['"x"', '"y"']);
  });

  it("read gives offsets past a comment between a key and its value", () => {
    const text = '{\n  "gen": /* the generator */ "openapi-typescript a"\n}\n';

    const [found] = stringsOf(text) ?? [];

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
  ])("read refuses text that is not a JSON object document: %s", (text) => {
    expect(reader.read(text).kind).toBe("unreadable");
  });

  it("read reads an empty text and an empty object", () => {
    expect(stringsOf("")).toEqual([]);
    expect(stringsOf("{}")).toEqual([]);
  });
});

describe("JsonTextReader tree", () => {
  it("read gives the offsets of keys and values, duplicate keys included", () => {
    const text = '{ "a": "x", "b": [1, true], "a": {"c": null} }';

    expect(entriesOf(text)).toEqual(['"a"="x"', '"b"=[1, true]', '"a"={"c": null}']);
    expect(rootOf(text)).toMatchObject({ kind: "map", start: 0, end: text.length });
  });

  it("read decodes strings as JSON.parse does and encodes new values as JSON strings", () => {
    const text = String.raw`{"key": "a\"b\\c\/d"}`;

    const [entry] = (rootOf(text) as TreeMap).entries;

    expect(entry?.key).toMatchObject({ kind: "scalar", value: "key" });
    expect(entry?.value).toMatchObject({ kind: "scalar", value: 'a"b\\c/d' });
    expect(entry?.value.kind === "scalar" && entry.value.encode?.('x"y')).toBe(String.raw`"x\"y"`);
  });

  it("read reads lists, and numbers, booleans and null as other nodes", () => {
    const root = rootOf('{"a": ["x", 1.0, false, null]}') as TreeMap;

    expect(root.entries[0]?.value).toMatchObject({
      kind: "list",
      items: [{ kind: "scalar" }, { kind: "other" }, { kind: "other" }, { kind: "other" }],
    });
  });

  it("read allows a byte order mark, comments and trailing commas", () => {
    const text = '﻿{\n  // c\n  "a": "x", /* d */\n}\n';

    expect(rootOf(text)).toMatchObject({ kind: "map", start: 1 });
    expect(entriesOf(text)).toEqual(['"a"="x"']);
  });

  it.each([
    ["{ nope", 6],
    ['{"a" 1}', 5],
    ['{"a": 1}{', 8],
    ["[1, 2]", 0],
    ['"text"', 0],
    ["{'a': 'x'}", 1],
    ['{"a": }', 6],
  ])("read refuses %j at offset %i", (text, offset) => {
    expect(reader.read(text)).toEqual({ kind: "unreadable", offset });
  });

  it("read gives an empty text as no document", () => {
    expect(reader.read("")).toEqual({ kind: "read", documents: [] });
  });

  it("read refuses nesting that exhausts the parser's stack, without a place", () => {
    const deep = `{"a": ${"[".repeat(20_000)}${"]".repeat(20_000)}}`;

    expect(reader.read(deep)).toEqual({ kind: "unreadable", offset: undefined });
  });
});
