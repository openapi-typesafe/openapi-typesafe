import type ts from "typescript";
import { irRaw } from "../../domain/ir/constructors.js";
import type {
  IrComment,
  IrKeyword,
  IrMember,
  IrPropertyName,
  IrPropertySignature,
  IrType,
} from "../../domain/ir/nodes.js";
import { toTypeNode } from "./ir-to-typescript.js";
import type { TypeScriptModule } from "./load-typescript.js";

/**
 * Read TypeScript type nodes from user callbacks into IR (ADR-004, decision 3). Synthesized nodes
 * are mapped by structure. Anything the IR cannot express exactly is printed with the TypeScript
 * printer, the way the original output it, and kept as a `raw` node: parsed nodes, nodes with
 * comments, explicit parentheses, single-quoted strings, numbers not in canonical form, and syntax
 * the IR does not model. Every function takes the user's TypeScript module (ADR-004, decision 4):
 * `SyntaxKind` numbers differ between versions, so a node is read with the module that made it.
 */

function keywordOf(ts: TypeScriptModule, kind: ts.SyntaxKind): IrKeyword | undefined {
  const keywords: ReadonlyMap<ts.SyntaxKind, IrKeyword> = new Map([
    [ts.SyntaxKind.StringKeyword, "string"],
    [ts.SyntaxKind.NumberKeyword, "number"],
    [ts.SyntaxKind.BooleanKeyword, "boolean"],
    [ts.SyntaxKind.UndefinedKeyword, "undefined"],
    [ts.SyntaxKind.UnknownKeyword, "unknown"],
    [ts.SyntaxKind.NeverKeyword, "never"],
  ]);
  return keywords.get(kind);
}

/** IR nodes have a string `kind`; TypeScript nodes have a numeric one. */
function isIrNode(value: unknown): value is IrType {
  return typeof (value as { kind?: unknown }).kind === "string";
}

/** Replace IR nodes nested in a TypeScript tree, so the TypeScript printer can print it. */
function withoutIrNodes<T extends ts.Node>(ts: TypeScriptModule, node: T): T {
  const visit = (child: ts.Node): ts.Node =>
    isIrNode(child) ? toTypeNode(ts, child) : ts.visitEachChild(child, visit, undefined);
  return visit(node) as T;
}

function printPlainNode(ts: TypeScriptModule, node: ts.Node): string {
  const source = ts.createSourceFile("openapi-ts.ts", "", ts.ScriptTarget.ESNext, false);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printNode(ts.EmitHint.Unspecified, node, source);
}

/** Print as the original did: the TypeScript printer with an empty source file and LF. */
export function printTypeScriptNode(ts: TypeScriptModule, node: ts.Node): string {
  return printPlainNode(ts, withoutIrNodes(ts, node));
}

/** The node as text, keeping the node itself for the way back to TypeScript (`toTypeNode`). */
function asRaw(ts: TypeScriptModule, node: ts.TypeNode): IrType {
  const printable = withoutIrNodes(ts, node);
  return irRaw(printPlainNode(ts, printable), printable);
}

function hasSyntheticComments(ts: TypeScriptModule, node: ts.Node): boolean {
  const leading = ts.getSyntheticLeadingComments(node)?.length ?? 0;
  return leading + (ts.getSyntheticTrailingComments(node)?.length ?? 0) > 0;
}

/** Parsed nodes print from their source text, and comments attach to text: keep both printed. */
function needsPrintedText(ts: TypeScriptModule, node: ts.Node): boolean {
  return node.pos >= 0 || hasSyntheticComments(ts, node);
}

function isCanonicalNumber(text: string): boolean {
  return String(Number(text)) === text;
}

function fromNumber(ts: TypeScriptModule, literal: ts.Expression): IrType | null {
  if (ts.isNumericLiteral(literal)) {
    return isCanonicalNumber(literal.text)
      ? { kind: "numberLiteral", value: Number(literal.text) }
      : null;
  }
  const isNegative =
    ts.isPrefixUnaryExpression(literal) &&
    literal.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(literal.operand) &&
    isCanonicalNumber(literal.operand.text) &&
    Number(literal.operand.text) !== 0;
  return isNegative
    ? { kind: "numberLiteral", value: -Number((literal.operand as ts.NumericLiteral).text) }
    : null;
}

function fromLiteral(ts: TypeScriptModule, node: ts.LiteralTypeNode): IrType | null {
  const { literal } = node;
  if (ts.isStringLiteral(literal)) {
    const isSingleQuoted = (literal as { singleQuote?: boolean }).singleQuote === true;
    return isSingleQuoted
      ? null
      : { kind: "stringLiteral", value: literal.text, encoding: "escaped" };
  }
  if (literal.kind === ts.SyntaxKind.NullKeyword) {
    return { kind: "keyword", keyword: "null" };
  }
  if (literal.kind === ts.SyntaxKind.TrueKeyword || literal.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: "booleanLiteral", value: literal.kind === ts.SyntaxKind.TrueKeyword };
  }
  return fromNumber(ts, literal);
}

/** Converts the children of one node, which becomes their parent. */
function childrenOf(ts: TypeScriptModule, parent: ts.Node): (child: ts.TypeNode) => IrType {
  return (child) => fromTypeNode(ts, child, parent);
}

function fromReference(ts: TypeScriptModule, node: ts.TypeReferenceNode): IrType | null {
  if (!ts.isIdentifier(node.typeName)) {
    return null;
  }
  const typeArguments = (node.typeArguments ?? []).map(childrenOf(ts, node));
  return { kind: "reference", name: ts.idText(node.typeName), typeArguments };
}

function fromTuple(ts: TypeScriptModule, node: ts.TupleTypeNode): IrType | null {
  const isPlain = node.elements.every(
    (element) => !ts.isNamedTupleMember(element) && !ts.isOptionalTypeNode(element),
  );
  if (!isPlain) {
    return null;
  }
  const convert = childrenOf(ts, node);
  const elements = node.elements.map((element) =>
    ts.isRestTypeNode(element)
      ? { type: convert(element.type), isRest: true }
      : { type: convert(element), isRest: false },
  );
  return { kind: "tuple", elements };
}

/**
 * Leading comments in order, or null when the IR cannot hold them: trailing comments, or a
 * comment without a line break after it (the IR always writes one).
 */
function fromComments(ts: TypeScriptModule, node: ts.Node): IrComment[] | null {
  const comments = ts.getSyntheticLeadingComments(node) ?? [];
  const hasTrailing = (ts.getSyntheticTrailingComments(node)?.length ?? 0) > 0;
  if (hasTrailing || comments.some((comment) => !comment.hasTrailingNewLine)) {
    return null;
  }
  return comments.map((comment) => ({
    kind: comment.kind === ts.SyntaxKind.MultiLineCommentTrivia ? "block" : "line",
    text: comment.text,
  }));
}

function fromPropertyName(ts: TypeScriptModule, name: ts.PropertyName): IrPropertyName | null {
  if (ts.isIdentifier(name)) {
    return { kind: "identifier", text: ts.idText(name) };
  }
  if (ts.isStringLiteral(name) && (name as { singleQuote?: boolean }).singleQuote !== true) {
    return { kind: "string", value: name.text };
  }
  return ts.isNumericLiteral(name) ? { kind: "number", text: name.text } : null;
}

/** Only `readonly` is modeled; any other modifier makes the member unreadable as IR. */
function readonlyFlag(ts: TypeScriptModule, node: ts.TypeElement): boolean | null {
  const modifiers = ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
  const isOnlyReadonly = modifiers.every(
    (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
  );
  return isOnlyReadonly ? modifiers.length > 0 : null;
}

/** A property signature as IR, or null when it uses syntax the IR does not model. */
export function fromPropertySignature(
  ts: TypeScriptModule,
  node: ts.PropertySignature,
): IrPropertySignature | null {
  const name = fromPropertyName(ts, node.name);
  const comments = fromComments(ts, node);
  const isReadonly = readonlyFlag(ts, node);
  if (name === null || comments === null || isReadonly === null || node.type === undefined) {
    return null;
  }
  return {
    kind: "property",
    name,
    type: fromTypeNode(ts, node.type, node),
    isOptional: node.questionToken !== undefined,
    isReadonly,
    comments,
  };
}

function fromIndexSignature(
  ts: TypeScriptModule,
  node: ts.IndexSignatureDeclaration,
): IrMember | null {
  const [parameter, ...others] = node.parameters;
  const comments = fromComments(ts, node);
  const isReadonly = readonlyFlag(ts, node);
  const isPlain =
    parameter?.type !== undefined && ts.isIdentifier(parameter.name) && others.length === 0;
  if (!isPlain || comments === null || isReadonly === null) {
    return null;
  }
  return {
    kind: "indexSignature",
    parameterName: ts.idText(parameter.name as ts.Identifier),
    parameterType: fromTypeNode(ts, parameter.type as ts.TypeNode, node),
    type: fromTypeNode(ts, node.type, node),
    isReadonly,
    comments,
  };
}

function fromMember(ts: TypeScriptModule, member: ts.TypeElement): IrMember | null {
  if (member.pos >= 0) {
    return null;
  }
  if (ts.isPropertySignature(member)) {
    return fromPropertySignature(ts, member);
  }
  return ts.isIndexSignatureDeclaration(member) ? fromIndexSignature(ts, member) : null;
}

function fromTypeLiteral(ts: TypeScriptModule, node: ts.TypeLiteralNode): IrType | null {
  const members = node.members.map((member) => fromMember(ts, member));
  const isReadable = members.every((member) => member !== null);
  return isReadable ? { kind: "object", members: members as IrMember[] } : null;
}

function fromComposite(ts: TypeScriptModule, node: ts.TypeNode): IrType | null {
  const convert = childrenOf(ts, node);
  if (ts.isArrayTypeNode(node)) {
    return { kind: "array", element: convert(node.elementType) };
  }
  if (ts.isUnionTypeNode(node)) {
    return { kind: "union", types: node.types.map(convert) };
  }
  if (ts.isIntersectionTypeNode(node)) {
    return { kind: "intersection", types: node.types.map(convert) };
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    return {
      kind: "indexedAccess",
      object: convert(node.objectType),
      index: convert(node.indexType),
    };
  }
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword) {
    return { kind: "readonly", type: convert(node.type) };
  }
  return ts.isTypeLiteralNode(node) ? fromTypeLiteral(ts, node) : null;
}

function fromStructure(ts: TypeScriptModule, node: ts.TypeNode): IrType | null {
  const keyword = keywordOf(ts, node.kind);
  if (keyword !== undefined) {
    return { kind: "keyword", keyword };
  }
  if (ts.isIdentifier(node)) {
    // The original writes JSON string literals and some references as bare identifiers.
    return irRaw(ts.idText(node));
  }
  if (ts.isLiteralTypeNode(node)) {
    return fromLiteral(ts, node);
  }
  if (ts.isTypeReferenceNode(node)) {
    return fromReference(ts, node);
  }
  return ts.isTupleTypeNode(node) ? fromTuple(ts, node) : fromComposite(ts, node);
}

/**
 * Whether the factory's parenthesizer put these parentheses in (same rules as the IR printer):
 * unions, intersections and `readonly` types as array elements, indexed objects and `readonly`
 * operands; unions and intersections as members of other unions or intersections.
 */
function isFactoryParenthesis(
  ts: TypeScriptModule,
  inner: ts.TypeNode,
  parent: ts.Node | undefined,
): boolean {
  if (parent === undefined) {
    return false;
  }
  const isComposite = ts.isUnionTypeNode(inner) || ts.isIntersectionTypeNode(inner);
  const isPostfixOrReadonlyParent =
    ts.isArrayTypeNode(parent) ||
    ts.isIndexedAccessTypeNode(parent) ||
    ts.isTypeOperatorNode(parent);
  if (isPostfixOrReadonlyParent) {
    return isComposite || ts.isTypeOperatorNode(inner);
  }
  const isCompositeParent = ts.isUnionTypeNode(parent) || ts.isIntersectionTypeNode(parent);
  return isCompositeParent && isComposite;
}

/**
 * Convert a type node. `parent` is the node that contains it: synthesized nodes have no `parent`
 * link, and it is needed to tell parentheses the factory inserted from ones the user wrote.
 */
export function fromTypeNode(ts: TypeScriptModule, node: ts.TypeNode, parent?: ts.Node): IrType {
  if (isIrNode(node)) {
    return node;
  }
  if (needsPrintedText(ts, node)) {
    return asRaw(ts, node);
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return isFactoryParenthesis(ts, node.type, parent)
      ? fromTypeNode(ts, node.type, parent)
      : asRaw(ts, node);
  }
  return fromStructure(ts, node) ?? asRaw(ts, node);
}
