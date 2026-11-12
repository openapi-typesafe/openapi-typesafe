import ts from "@typescript/typescript6";
import type { TextEdit } from "../../domain/text-edits.js";
import type { FileBindings } from "./file-bindings.js";

/**
 * The types a `transform` declares outside its own return type: the type of the `const` that
 * holds it (`const transform: (s: SchemaObject) => ts.TypeNode = …`, or JSDoc `@type` there and
 * on the option), and a JSDoc `@returns`. Each names TypeScript nodes, which the rewritten
 * returns no longer are, so the file stopped compiling. A TypeScript node type in them becomes
 * `string`, the type text the returns are now; a type the tool cannot map keeps the `transform`.
 */

/** The text that replaces a TypeScript node type: the returns are type text strings. */
const TYPE_TEXT = "string";
const TYPESCRIPT_MODULES: ReadonlySet<string> = new Set(["typescript", "@typescript/typescript6"]);

/** What the declared types need: edits, or undefined when one of them cannot be mapped. */
export type DeclaredTypeEdits = TextEdit[] | undefined;

/** Whether a type reference names a TypeScript node type: `ts.TypeNode`, a named import of it. */
function isTypescriptReference(node: ts.TypeReferenceNode, bindings: FileBindings): boolean {
  const name = node.typeName;
  if (ts.isIdentifier(name)) {
    return bindings.bindingOf(name)?.kind === "typescript-import";
  }
  return ts.isIdentifier(name.left) && bindings.bindingOf(name.left)?.kind === "typescript-module";
}

/** Whether an import type names the TypeScript module: `import("typescript").TypeNode`. */
function isTypescriptImportType(node: ts.ImportTypeNode): boolean {
  const { argument } = node;
  return (
    !node.isTypeOf &&
    ts.isLiteralTypeNode(argument) &&
    ts.isStringLiteral(argument.literal) &&
    TYPESCRIPT_MODULES.has(argument.literal.text)
  );
}

/** The edits of every part, or undefined when one part cannot be mapped. */
function joined(found: readonly DeclaredTypeEdits[]): DeclaredTypeEdits {
  const edits: TextEdit[] = [];
  for (const part of found) {
    if (part === undefined) {
      return undefined;
    }
    edits.push(...part);
  }
  return edits;
}

/** The edits for the members of a type literal (`{ schema: ts.TypeNode; questionToken: … }`). */
const memberEdits = (node: ts.TypeLiteralNode, bindings: FileBindings): DeclaredTypeEdits =>
  joined(
    node.members.map((member) =>
      ts.isPropertySignature(member) ? typeEdits(member.type, bindings) : undefined,
    ),
  );

const replaced = (node: ts.Node): TextEdit[] => [
  { start: node.getStart(), end: node.getEnd(), text: TYPE_TEXT },
];

const isKeyword = (node: ts.Node): boolean =>
  node.kind >= ts.SyntaxKind.FirstKeyword && node.kind <= ts.SyntaxKind.LastKeyword;

/**
 * The edits that make a declared return type fit type text: each TypeScript node type becomes
 * `string`; keywords and literal types stay. Undefined for any other type (a local alias,
 * `TransformObject`, an array), whose meaning the tool does not map.
 */
function typeEdits(node: ts.TypeNode | undefined, bindings: FileBindings): DeclaredTypeEdits {
  if (node === undefined) {
    return undefined;
  }
  if (ts.isLiteralTypeNode(node) || isKeyword(node)) {
    return [];
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    return joined(node.types.map((part) => typeEdits(part, bindings)));
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return typeEdits(node.type, bindings);
  }
  if (ts.isTypeLiteralNode(node)) {
    return memberEdits(node, bindings);
  }
  const isNodeType = ts.isTypeReferenceNode(node)
    ? isTypescriptReference(node, bindings)
    : ts.isImportTypeNode(node) && isTypescriptImportType(node);
  return isNodeType ? replaced(node) : undefined;
}

/** The return type of a function type (`(s) => R`, JSDoc `function(s): R`), or undefined. */
function functionReturnType(node: ts.TypeNode): ts.TypeNode | undefined {
  return ts.isFunctionTypeNode(node) || ts.isJSDocFunctionType(node) ? node.type : undefined;
}

/**
 * The declared type of the `const` or the option that holds `transform`, as TypeScript reads it:
 * the annotation, or the JSDoc `@type` in a JavaScript file.
 */
export function declaredType(node: ts.Node): ts.TypeNode | undefined {
  const annotation = ts.isVariableDeclaration(node) ? node.type : undefined;
  const isJavaScript = (node.flags & ts.NodeFlags.JavaScriptFile) !== 0;
  return annotation ?? (isJavaScript ? ts.getJSDocType(node) : undefined);
}

/**
 * The edits for one declared type of the callback: the return type of a function type. The
 * options member (`OpenAPITSOptions["transform"]`) is retargeted with the options type
 * (options-type.ts), and `any` takes type text; any other type is not mapped (undefined).
 */
function annotationEdits(type: ts.TypeNode, bindings: FileBindings): DeclaredTypeEdits {
  const returned = functionReturnType(type);
  if (returned !== undefined) {
    return typeEdits(returned, bindings);
  }
  return ts.isIndexedAccessTypeNode(type) || isKeyword(type) ? [] : undefined;
}

/**
 * The edits that make the declared types of a callback fit type text: its `const` or option
 * types and its JSDoc `@returns`. Undefined when one of them cannot be mapped, so the
 * `transform` is kept and reported.
 */
export function callbackTypeEdits(
  annotations: readonly ts.TypeNode[],
  callback: ts.FunctionLikeDeclaration,
  bindings: FileBindings,
): DeclaredTypeEdits {
  const returnsTag = ts.getJSDocReturnTag(callback)?.typeExpression?.type;
  return joined([
    ...annotations.map((type) => annotationEdits(type, bindings)),
    returnsTag === undefined ? [] : typeEdits(returnsTag, bindings),
  ]);
}
