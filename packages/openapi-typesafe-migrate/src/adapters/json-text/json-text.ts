import ts from "@typescript/typescript6";
import type { JsonDocumentReader } from "../../application/ports.js";
import type { DocumentRead, TreeEntry, TreeNode } from "../../domain/config-documents.js";

/**
 * The JsonDocumentReader port on the TypeScript 6 JSON parser (ADR-015), the one tsc reads
 * `tsconfig.json` with: it accepts comments and trailing commas, as `deno.jsonc` and Nx
 * `project.json` do, and gives every node its offsets in the text. A byte order mark is allowed
 * before the value.
 */

/** The parser names the file in its diagnostics only. */
const FILE_NAME = "document.json";
/** The length of the quote on each side of a JSON string. */
const QUOTE_LENGTH = 1;

const encode = (value: string): string => JSON.stringify(value);

function spanOf(node: ts.Node, file: ts.SourceFile): { start: number; end: number } {
  return { start: node.getStart(file), end: node.end };
}

function convertString(node: ts.StringLiteral, file: ts.SourceFile): TreeNode {
  const span = spanOf(node, file);
  const content = { start: span.start + QUOTE_LENGTH, end: span.end - QUOTE_LENGTH };
  return { kind: "scalar", value: node.text, content, isFolded: false, encode, ...span };
}

function convertObject(node: ts.ObjectLiteralExpression, file: ts.SourceFile): TreeNode {
  // A valid document has only quoted keys (see firstError); the check narrows the node type.
  const entries = node.properties.filter(ts.isPropertyAssignment).map(
    (property): TreeEntry => ({
      key: ts.isStringLiteral(property.name)
        ? convertString(property.name, file)
        : { kind: "other", ...spanOf(property.name, file) },
      value: convert(property.initializer, file),
    }),
  );
  return { kind: "map", entries, ...spanOf(node, file) };
}

function convert(node: ts.Expression, file: ts.SourceFile): TreeNode {
  if (ts.isObjectLiteralExpression(node)) {
    return convertObject(node, file);
  }
  if (ts.isArrayLiteralExpression(node)) {
    const items = node.elements.map((item) => convert(item, file));
    return { kind: "list", items, ...spanOf(node, file) };
  }
  if (ts.isStringLiteral(node)) {
    return convertString(node, file);
  }
  return { kind: "other", ...spanOf(node, file) };
}

/**
 * `parseJsonText` keeps its syntax errors internal. This public reader of the same grammar
 * reports the first of them, and rejects what JSON forbids and the parser allows: unquoted or
 * single-quoted keys, and a root value that is not an object.
 */
function firstError(text: string): number | undefined {
  const { error } = ts.parseConfigFileTextToJson(FILE_NAME, text);
  return error === undefined ? undefined : (error.start ?? 0);
}

function readTree(text: string): DocumentRead {
  const errorAt = firstError(text);
  if (errorAt !== undefined) {
    return { kind: "unreadable", offset: errorAt };
  }
  const file = ts.parseJsonText(FILE_NAME, text);
  const documents = file.statements.map((statement) => convert(statement.expression, file));
  return { kind: "read", documents };
}

function read(text: string): DocumentRead {
  try {
    return readTree(text);
  } catch (error) {
    // The parser and the conversion recurse per level of nesting: a crafted file (about a
    // thousand levels) exhausts the stack, and the error gives no place.
    if (error instanceof RangeError) {
      return { kind: "unreadable", offset: undefined };
    }
    throw error;
  }
}

export function createJsonTextReader(): JsonDocumentReader {
  return { read };
}
