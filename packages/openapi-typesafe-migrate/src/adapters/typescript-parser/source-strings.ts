import ts from "@typescript/typescript6";
import type { SourceStringScanner } from "../../application/ports.js";
import type { SourceString } from "../../domain/source-migration.js";
import { type ScriptRegion, scriptRegions } from "./script-regions.js";

/**
 * The SourceStringScanner port on the TypeScript 6 parser (ADR-015). It finds every string
 * literal of a file's scripts, JSDoc types included, and the `/// <reference types>` directives,
 * and tells module specifiers from other strings by the syntax around them.
 */

/** Mock and module-loading methods of vitest (`vi`) and jest whose first argument is a module. */
const MOCK_OBJECTS: ReadonlySet<string> = new Set(["vi", "jest"]);
const MOCK_METHODS: ReadonlySet<string> = new Set([
  "mock",
  "doMock",
  "unmock",
  "doUnmock",
  "importActual",
  "importMock",
  "requireActual",
  "requireMock",
  "createMockFromModule",
  "unstable_mockModule",
]);
const REQUIRE = "require";
const RESOLVE = "resolve";

function isIdentifierNamed(node: ts.Node, names: ReadonlySet<string> | string): boolean {
  if (!ts.isIdentifier(node)) {
    return false;
  }
  return typeof names === "string" ? node.text === names : names.has(node.text);
}

/** `vi.mock`, `jest.requireActual`, `require.resolve` and `import.meta.resolve`. */
function isModuleMethod(callee: ts.PropertyAccessExpression): boolean {
  const object = callee.expression;
  const method = callee.name.text;
  if (isIdentifierNamed(object, MOCK_OBJECTS)) {
    return MOCK_METHODS.has(method);
  }
  return method === RESOLVE && (isIdentifierNamed(object, REQUIRE) || ts.isMetaProperty(object));
}

/** Calls whose first argument is a module: `import()`, `require()` and the module methods. */
function isModuleCall(call: ts.CallExpression): boolean {
  const callee = call.expression;
  if (callee.kind === ts.SyntaxKind.ImportKeyword || isIdentifierNamed(callee, REQUIRE)) {
    return true;
  }
  return ts.isPropertyAccessExpression(callee) && isModuleMethod(callee);
}

function isModuleSpecifier(literal: ts.StringLiteralLike): boolean {
  const parent = literal.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) {
    return parent.moduleSpecifier === literal;
  }
  if (ts.isCallExpression(parent)) {
    return parent.arguments[0] === literal && isModuleCall(parent);
  }
  if (ts.isModuleDeclaration(parent)) {
    return parent.name === literal;
  }
  // `import("openapi-fetch").Client` in a type, also in a JSDoc type of a JavaScript file.
  if (ts.isLiteralTypeNode(parent)) {
    return ts.isImportTypeNode(parent.parent);
  }
  return ts.isExternalModuleReference(parent);
}

type FoundStrings = Map<number, SourceString>;

/** Adds the string literals under `root` to `found`; `file` starts at `offset` in the file. */
function collectStrings(
  root: ts.Node,
  file: ts.SourceFile,
  offset: number,
  found: FoundStrings,
): void {
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node)) {
      // The value starts after the opening quote and ends before the closing one.
      const start = offset + node.getStart(file) + 1;
      const end = offset + node.getEnd() - 1;
      found.set(start, {
        start,
        end,
        value: node.text,
        isModuleSpecifier: isModuleSpecifier(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
}

/**
 * Every comment of a parsed file. Comments are the trivia in front of tokens, so the ranges in
 * front of each token cover them all, also where no node owns a JSDoc block. A trailing range
 * ends at the first line break and a leading one starts after it, so a token needs both. JSX text
 * is not trivia, and the JSDoc nodes are read from their comments, so neither is walked.
 */
function commentRanges(file: ts.SourceFile): ts.CommentRange[] {
  const ranges = new Map<number, ts.CommentRange>();
  const add = (found: ts.CommentRange[] | undefined): void => {
    for (const range of found ?? []) {
      ranges.set(range.pos, range);
    }
  };
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.JsxText) {
      return;
    }
    const children = node.getChildren(file).filter((child) => !ts.isJSDoc(child));
    if (children.length === 0) {
      add(ts.getTrailingCommentRanges(file.text, node.pos));
      add(ts.getLeadingCommentRanges(file.text, node.pos));
    }
    children.forEach(visit);
  };
  visit(file);
  return [...ranges.values()];
}

const JSDOC_START = "/**";
const EMPTY_BLOCK_COMMENT = "/**/";
/** A statement for an isolated JSDoc block to belong to, so that the parser reads the block. */
const JSDOC_HOST = "\nvar host;";
const JSDOC_FILE_NAME = "jsdoc.js";

/**
 * Adds the strings of one JSDoc block. The parser reads only the last block before a node it
 * keeps JSDoc for, so each block is parsed on its own, in front of a statement of its own.
 */
function collectJsDocStrings(comment: string, offset: number, found: FoundStrings): void {
  const text = `${comment}${JSDOC_HOST}`;
  const file = ts.createSourceFile(JSDOC_FILE_NAME, text, ts.ScriptTarget.Latest, true);
  const host = file.statements[0] as ts.Statement;
  for (const doc of ts.getJSDocCommentsAndTags(host)) {
    collectStrings(doc, file, offset, found);
  }
}

function literalStrings(file: ts.SourceFile, offset: number): FoundStrings {
  const found: FoundStrings = new Map();
  collectStrings(file, file, offset, found);
  for (const range of commentRanges(file)) {
    const comment = file.text.slice(range.pos, range.end);
    if (comment.startsWith(JSDOC_START) && comment !== EMPTY_BLOCK_COMMENT) {
      collectJsDocStrings(comment, offset + range.pos, found);
    }
  }
  return found;
}

function regionStrings(region: ScriptRegion, path: string): SourceString[] {
  const file = ts.createSourceFile(path, region.text, ts.ScriptTarget.Latest, true, region.kind);
  const found = literalStrings(file, region.offset);
  for (const reference of file.typeReferenceDirectives) {
    const start = region.offset + reference.pos;
    const end = region.offset + reference.end;
    found.set(start, { start, end, value: reference.fileName, isModuleSpecifier: true });
  }
  return [...found.values()];
}

class TypescriptSourceStringScanner implements SourceStringScanner {
  scan(text: string, path: string): SourceString[] {
    return scriptRegions(text, path)
      .flatMap((region) => regionStrings(region, path))
      .sort((left, right) => left.start - right.start);
  }
}

/** A source string scanner that parses each script with the TypeScript 6 parser. */
export function createTypescriptStringScanner(): SourceStringScanner {
  return new TypescriptSourceStringScanner();
}
