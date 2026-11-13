import { CST, isAlias, isMap, isNode, isScalar, isSeq, parseAllDocuments, Scalar } from "yaml";
import type { YamlDocumentReader } from "../../application/ports.js";
import type { DocumentRead, TreeNode } from "../../domain/config-documents.js";

/**
 * The YamlDocumentReader port on the `yaml` package (ADR-015). It keeps the source tokens, so
 * each scalar has the offsets of its text as written, in block and flow style alike, and reads
 * every document of a stream.
 */

interface Conversion {
  /** Inside a flow collection (`{ … }`, `[ … ]`), where `,` and brackets end a plain scalar. */
  readonly isFlow: boolean;
}

interface TextRange {
  readonly start: number;
  readonly end: number;
}

type Quoting = (value: string) => string;

const plain: Quoting = (value) => value;
const singleQuoted: Quoting = (value) => `'${value.replaceAll("'", "''")}'`;
// JSON is YAML: a JSON string is a valid double-quoted scalar for every value.
const doubleQuoted: Quoting = (value) => JSON.stringify(value);

/** The quotings a new value may take, the old scalar's first; block scalars take none. */
const QUOTINGS: Readonly<Record<string, readonly Quoting[]>> = {
  [Scalar.PLAIN]: [plain, singleQuoted, doubleQuoted],
  [Scalar.QUOTE_SINGLE]: [singleQuoted, doubleQuoted],
  [Scalar.QUOTE_DOUBLE]: [doubleQuoted],
};

/** Whether `written`, at a place like the old scalar's, reads back as the string `value`. */
function readsBack(written: string, value: string, isFlow: boolean): boolean {
  const [document] = parseAllDocuments(isFlow ? `[${written}]` : `- ${written}`);
  const list = document?.contents;
  const item = isSeq(list) && list.items.length === 1 ? list.items[0] : undefined;
  return document?.errors.length === 0 && isScalar(item) && item.value === value;
}

/**
 * The old scalar's quoting, or the next one that can hold the new value: a value that plain text
 * would read as another type or cut short (`true`, `a: b`, `x #y`) is quoted.
 */
function encoderFor(quotings: readonly Quoting[], isFlow: boolean): (value: string) => string {
  return (value) =>
    quotings.map((quoting) => quoting(value)).find((text) => readsBack(text, value, isFlow)) ??
    doubleQuoted(value);
}

/** The content lines of a block scalar follow its header line, which its props make up. */
function blockContent(token: CST.BlockScalar): TextRange {
  const headerLength = token.props.reduce((length, prop) => length + CST.stringify(prop).length, 0);
  const start = token.offset + headerLength;
  return { start, end: start + token.source.trimEnd().length };
}

/** The text of a scalar as written: without quotes, and without the header of a block scalar. */
function contentRange(token: CST.Token | undefined, node: TextRange): TextRange {
  switch (token?.type) {
    case "scalar":
      return { start: token.offset, end: token.offset + token.source.length };
    case "single-quoted-scalar":
    case "double-quoted-scalar":
      return { start: token.offset + 1, end: token.offset + token.source.length - 1 };
    case "block-scalar":
      return blockContent(token);
    default:
      return node;
  }
}

function spanOf(node: { range?: [number, number, number] | null }): TextRange {
  const [start, end] = node.range ?? [0, 0];
  return { start, end };
}

/** A plain scalar that YAML reads as a number or boolean keeps its text as written. */
function scalarText(node: Scalar): string | undefined {
  if (typeof node.value === "string") {
    return node.value;
  }
  const isWritten = node.type === Scalar.PLAIN && node.value !== null;
  return isWritten ? node.source : undefined;
}

/** The text that starts an escape in a quoted scalar, by the type of its token. */
const ESCAPES: Readonly<Partial<Record<string, string>>> = {
  "single-quoted-scalar": "''",
  "double-quoted-scalar": "\\",
};

/** Whether a quoted scalar has an escape in its text as written. */
function isEscaped(token: CST.Token | undefined): boolean {
  const escapeStart = token === undefined ? undefined : ESCAPES[token.type];
  return escapeStart !== undefined && token !== undefined && "source" in token
    ? token.source.includes(escapeStart)
    : false;
}

function convertScalar(node: Scalar, isFlow: boolean): TreeNode {
  const span = spanOf(node);
  const value = scalarText(node);
  if (value === undefined) {
    return { kind: "other", ...span };
  }
  const quotings = node.type === undefined ? undefined : QUOTINGS[node.type];
  const isReplaceable =
    quotings !== undefined && node.anchor === undefined && node.tag === undefined;
  return {
    kind: "scalar",
    ...anchorOf(node),
    value,
    content: contentRange(node.srcToken, span),
    isFolded: node.type !== Scalar.BLOCK_LITERAL,
    isEscaped: isEscaped(node.srcToken),
    encode: isReplaceable ? encoderFor(quotings, isFlow) : undefined,
    ...span,
  };
}

/** The anchor of a node (`&scripts`), as a property only where the node has one. */
const anchorOf = (node: { anchor?: string }): { anchor?: string } =>
  node.anchor === undefined ? {} : { anchor: node.anchor };

const flowOf = (conversion: Conversion, node: { flow?: boolean }): Conversion => ({
  isFlow: conversion.isFlow || node.flow === true,
});

function convert(node: unknown, conversion: Conversion): TreeNode {
  if (isScalar(node)) {
    return convertScalar(node, conversion.isFlow);
  }
  if (isSeq(node)) {
    const inner = flowOf(conversion, node);
    const items = node.items.map((item) => convert(item, inner));
    return { kind: "list", items, ...anchorOf(node), ...spanOf(node) };
  }
  if (isMap(node)) {
    const inner = flowOf(conversion, node);
    const entries = node.items.map((pair) => ({
      key: convert(pair.key, inner),
      value: convert(pair.value, inner),
    }));
    return { kind: "map", entries, ...anchorOf(node), ...spanOf(node) };
  }
  if (isAlias(node)) {
    return { kind: "other", alias: node.source, ...spanOf(node) };
  }
  // No value at all (`key:` with nothing after it).
  return { kind: "other", ...spanOf(isNode(node) ? node : {}) };
}

/**
 * The offset of the first key that repeats an earlier scalar key of the same map, under `node`.
 * YAML forbids such a key. The `yaml` package checks it by comparing each key with every key
 * before it, which took 25 s on a 6 MB OpenAPI document; this check is linear and finds the same
 * keys: scalar keys with the same value.
 */
function duplicateKeyOffset(node: unknown): number | undefined {
  if (isSeq(node)) {
    return firstOffset(node.items);
  }
  if (!isMap(node)) {
    return undefined;
  }
  const keys = new Set<unknown>();
  for (const pair of node.items) {
    if (isScalar(pair.key) && keys.has(pair.key.value)) {
      return spanOf(pair.key).start;
    }
    keys.add(isScalar(pair.key) ? pair.key.value : pair.key);
  }
  return firstOffset(node.items.flatMap((pair) => [pair.key, pair.value]));
}

function firstOffset(nodes: readonly unknown[]): number | undefined {
  for (const node of nodes) {
    const offset = duplicateKeyOffset(node);
    if (offset !== undefined) {
      return offset;
    }
  }
  return undefined;
}

/**
 * How the `yaml` package parses a config. Its own duplicate key check compares each key with every
 * key before it, so it is turned off (`uniqueKeys: false`) for the linear one above; the source
 * tokens give the offsets of the strings the migrations edit.
 */
export const YAML_PARSE_OPTIONS = { keepSourceTokens: true, uniqueKeys: false } as const;

/**
 * The `yaml` package stops at nesting deeper than the stack allows and reports it as an error, so
 * a tree it gives is shallow enough for the migrations to walk.
 */
function read(text: string): DocumentRead {
  const documents = parseAllDocuments(text, YAML_PARSE_OPTIONS);
  const error = documents.flatMap((document) => document.errors)[0];
  if (error !== undefined) {
    return { kind: "unreadable", offset: error.pos[0] };
  }
  const duplicate = firstOffset(documents.map((document) => document.contents));
  if (duplicate !== undefined) {
    return { kind: "unreadable", offset: duplicate };
  }
  const roots = documents.flatMap((document) =>
    document.contents === null ? [] : [convert(document.contents, { isFlow: false })],
  );
  return { kind: "read", documents: roots };
}

export function createYamlTextReader(): YamlDocumentReader {
  return { read };
}
