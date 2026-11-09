import ts from "@typescript/typescript6";
import type { JsonDocumentReader } from "../../application/ports.js";
import type { DocumentPath, JsonString } from "../../domain/config-documents.js";

/**
 * The JsonDocumentReader port on the TypeScript 6 JSON parser (ADR-015), the one tsc reads
 * `tsconfig.json` with: it accepts comments and trailing commas, as `deno.jsonc` and Nx
 * `project.json` do, and gives each string literal its offsets in the text.
 */

/** The parser names the file in its diagnostics only. */
const FILE_NAME = "document.json";

/** The texts of one document, for the walk over its nodes. */
interface Walk {
  readonly file: ts.JsonSourceFile;
  readonly strings: JsonString[];
}

function collectStrings(walk: Walk, node: ts.Expression, path: DocumentPath): void {
  if (ts.isStringLiteral(node)) {
    const start = node.getStart(walk.file);
    walk.strings.push({ path, value: node.text, start, end: node.end });
  } else if (ts.isArrayLiteralExpression(node)) {
    for (const [index, element] of node.elements.entries()) {
      collectStrings(walk, element, [...path, index]);
    }
  } else if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      // A valid document has only quoted keys; the check narrows the node type.
      if (ts.isPropertyAssignment(property) && ts.isStringLiteral(property.name)) {
        collectStrings(walk, property.initializer, [...path, property.name.text]);
      }
    }
  }
}

function jsonStrings(text: string): JsonString[] | undefined {
  // `parseJsonText` keeps its syntax errors internal. This public reader of the same grammar
  // reports them, and rejects what JSON forbids and the parser allows: unquoted or single-quoted
  // keys, and a root value that is not an object.
  if (ts.parseConfigFileTextToJson(FILE_NAME, text).error !== undefined) {
    return undefined;
  }
  const file = ts.parseJsonText(FILE_NAME, text);
  const walk: Walk = { file, strings: [] };
  for (const statement of file.statements) {
    collectStrings(walk, statement.expression, []);
  }
  return walk.strings;
}

export function createJsonTextReader(): JsonDocumentReader {
  return { strings: jsonStrings };
}
