import ts from "@typescript/typescript6";
import type { TextEdit } from "../../domain/text-edits.js";
import { type FactoryNames, typeTextOf } from "./factory-type-text.js";
import type { Binding } from "./file-bindings.js";

/**
 * After the `transform` returns become type text, the module-level constants that built the old
 * nodes (`const DATE = ts.factory…`), and the TypeScript and helper imports that only they used,
 * are no longer read. Left in place they fail `noUnusedLocals` (TS6133), so they are removed.
 * Only declarations that the rewrite made unused go: each had uses, and all of them were in
 * replaced text or in other removed declarations. A constant goes only when its initializer is a
 * type-building expression, so no side effect is lost; an exported one always stays.
 */

/** A removed declaration, for the report. */
export interface RemovedDeclaration {
  readonly node: ts.Node;
  readonly name: string;
}

interface Range {
  readonly start: number;
  readonly end: number;
}

const isExported = (node: ts.Node): boolean =>
  (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;

function isRemovable(node: ts.Node, binding: Binding, names: FactoryNames): boolean {
  switch (binding.kind) {
    case "typescript-module":
    case "typescript-import":
    case "helper-import":
      return true;
    case "constant":
      return !isExported(node) && typeTextOf(binding.initializer, names) !== undefined;
    default:
      return false;
  }
}

const isInside = (node: ts.Node, ranges: readonly Range[]): boolean =>
  ranges.some((range) => node.getStart() >= range.start && node.getEnd() <= range.end);

/** The declarations that the replaced ranges leave without a use, until nothing changes. */
export function unusedDeclarations(
  names: FactoryNames,
  replaced: readonly TextEdit[],
): RemovedDeclaration[] {
  const ranges: Range[] = replaced.filter((edit) => edit.end > edit.start);
  const removed: RemovedDeclaration[] = [];
  for (let isChanged = true; isChanged; ) {
    isChanged = false;
    for (const [node, binding] of names.bindings.declarations) {
      const uses = names.bindings.usesOf(node);
      const isUnused = uses.length > 0 && uses.every((use) => isInside(use, ranges));
      const isNew = removed.every((found) => found.node !== node);
      if (isNew && isUnused && isRemovable(node, binding, names)) {
        const name = (node as ts.NamedDeclaration).name?.getText() ?? "";
        removed.push({ node, name });
        ranges.push({ start: node.getStart(), end: node.getEnd() });
        isChanged = true;
      }
    }
  }
  return removed;
}

/** The edit that removes a whole statement, with its line when nothing else is on it. */
function statementRemoval(statement: ts.Statement, text: string): TextEdit {
  const start = statement.getStart(undefined, true);
  const end = statement.getEnd();
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineBreak = text.indexOf("\n", end);
  const lineEnd = lineBreak === -1 ? text.length : lineBreak + 1;
  const isAlone =
    text.slice(lineStart, start).trim() === "" && text.slice(end, lineEnd).trim() === "";
  return isAlone ? { start: lineStart, end: lineEnd, text: "" } : { start, end, text: "" };
}

/**
 * The edits that remove some elements of a comma-separated list. An element before the last kept
 * one goes with the comma after it; the elements after the last kept one go with the comma before
 * them, in one edit.
 */
function listRemovals(
  elements: readonly ts.Node[],
  isRemoved: (node: ts.Node) => boolean,
): TextEdit[] {
  const lastKept = elements.findLastIndex((element) => !isRemoved(element));
  const edits: TextEdit[] = [];
  elements.forEach((element, index) => {
    const next = elements[index + 1];
    if (index < lastKept && isRemoved(element) && next !== undefined) {
      edits.push({ start: element.getStart(), end: next.getStart(), text: "" });
    }
  });
  const last = elements.at(-1);
  if (lastKept !== -1 && last !== undefined && lastKept < elements.length - 1) {
    edits.push({ start: (elements[lastKept] as ts.Node).getEnd(), end: last.getEnd(), text: "" });
  }
  return edits;
}

type IsRemoved = (node: ts.Node) => boolean;

/** The edits for an import some of whose bindings were removed. */
function importEdits(
  statement: ts.ImportDeclaration,
  isRemoved: IsRemoved,
  text: string,
): TextEdit[] {
  const clause = statement.importClause as ts.ImportClause;
  const bindings = clause.namedBindings;
  const named = bindings !== undefined && ts.isNamedImports(bindings) ? bindings : undefined;
  const namespace = bindings !== undefined && ts.isNamespaceImport(bindings) ? bindings : undefined;
  const parts: ts.Node[] = [
    ...(clause.name === undefined ? [] : [clause]),
    ...(namespace === undefined ? [] : [namespace]),
    ...(named?.elements ?? []),
  ];
  if (parts.every(isRemoved)) {
    return [statementRemoval(statement, text)];
  }
  // Not every part is removed, so a removed default import has a named or namespace one after it.
  const defaultEnd = clause.name?.getEnd() ?? 0;
  const edits: TextEdit[] = [];
  if (clause.name !== undefined && isRemoved(clause)) {
    edits.push({ start: clause.name.getStart(), end: (bindings as ts.Node).getStart(), text: "" });
  }
  if (namespace !== undefined && isRemoved(namespace)) {
    edits.push({ start: defaultEnd, end: namespace.getEnd(), text: "" });
  }
  if (named !== undefined && named.elements.length > 0 && named.elements.every(isRemoved)) {
    edits.push({ start: defaultEnd, end: named.getEnd(), text: "" });
  } else if (named !== undefined) {
    edits.push(...listRemovals(named.elements, isRemoved));
  }
  return edits;
}

function statementEdits(statement: ts.Statement, isRemoved: IsRemoved, text: string): TextEdit[] {
  if (ts.isImportDeclaration(statement)) {
    return importEdits(statement, isRemoved, text);
  }
  const declarations = (statement as ts.VariableStatement).declarationList.declarations;
  return declarations.every(isRemoved)
    ? [statementRemoval(statement, text)]
    : listRemovals(declarations, isRemoved);
}

/** The edits that remove the declarations, grouped by the statement each belongs to. */
export function removalEdits(removed: readonly RemovedDeclaration[], text: string): TextEdit[] {
  const nodes = new Set(removed.map((found) => found.node));
  const isRemoved: IsRemoved = (node) => nodes.has(node);
  const statements = new Set(
    removed.map(
      (found) =>
        ts.findAncestor(
          found.node,
          (node) => ts.isVariableStatement(node) || ts.isImportDeclaration(node),
        ) as ts.Statement,
    ),
  );
  return [...statements].flatMap((statement) => statementEdits(statement, isRemoved, text));
}
