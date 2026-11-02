import ts from "typescript";
import { assertNever } from "../../src/domain/assert-never.js";
import {
  irArray,
  irBoolean,
  irIndexedAccess,
  irIntersection,
  irKeyword,
  irNumber,
  irObject,
  irRaw,
  irReadonly,
  irReference,
  irString,
  irTuple,
  irTupleElement,
  irUnion,
} from "../../src/domain/ir/constructors.js";
import type {
  IrComment,
  IrDeclaration,
  IrEnumMember,
  IrKeyword,
  IrMember,
  IrPropertyName,
  IrType,
} from "../../src/domain/ir/nodes.js";

/**
 * Read generated declarations back into IR (benchmark input for ENGINEERING_PLAN 4.5). Only the
 * syntax the generator emits is accepted; anything else throws, so a benchmark never measures a
 * silently simplified file.
 */

/** The file is not valid TypeScript, so it has no IR (the original emitted broken output). */
export class InvalidSourceError extends Error {
  constructor(message: string) {
    super(`Invalid TypeScript: ${message}`);
    this.name = "InvalidSourceError";
  }
}

export class UnsupportedSyntaxError extends Error {
  constructor(node: ts.Node) {
    super(`Unsupported syntax ${ts.SyntaxKind[node.kind]}: ${node.getText().slice(0, 80)}`);
    this.name = "UnsupportedSyntaxError";
  }
}

const KEYWORDS: ReadonlyMap<ts.SyntaxKind, IrKeyword> = new Map([
  [ts.SyntaxKind.StringKeyword, "string"],
  [ts.SyntaxKind.NumberKeyword, "number"],
  [ts.SyntaxKind.BooleanKeyword, "boolean"],
  [ts.SyntaxKind.UndefinedKeyword, "undefined"],
  [ts.SyntaxKind.UnknownKeyword, "unknown"],
  [ts.SyntaxKind.NeverKeyword, "never"],
]);

/** The generator writes a string type as JSON text, or with TypeScript escaping (see IR docs). */
function toStringType(literal: ts.StringLiteral): IrType {
  const isJson = JSON.stringify(literal.text) === literal.getText();
  return irString(literal.text, isJson ? "json" : "escaped");
}

function toNumber(expression: ts.Expression): number {
  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }
  const isNegative =
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand);
  if (!isNegative) {
    throw new UnsupportedSyntaxError(expression);
  }
  return -Number((expression.operand as ts.NumericLiteral).text);
}

function toLiteralType(node: ts.LiteralTypeNode): IrType {
  const { literal } = node;
  if (ts.isStringLiteral(literal)) {
    return toStringType(literal);
  }
  switch (literal.kind) {
    case ts.SyntaxKind.NullKeyword:
      return irKeyword("null");
    case ts.SyntaxKind.TrueKeyword:
      return irBoolean(true);
    case ts.SyntaxKind.FalseKeyword:
      return irBoolean(false);
    default:
      return irNumber(toNumber(literal as ts.Expression));
  }
}

function toReference(node: ts.TypeReferenceNode): IrType {
  if (!ts.isIdentifier(node.typeName)) {
    throw new UnsupportedSyntaxError(node);
  }
  return irReference(node.typeName.text, (node.typeArguments ?? []).map(toIrType));
}

function toTupleType(node: ts.TupleTypeNode): IrType {
  return irTuple(
    node.elements.map((element) =>
      ts.isRestTypeNode(element)
        ? irTupleElement(toIrType(element.type), true)
        : irTupleElement(toIrType(element)),
    ),
  );
}

function toOperatorType(node: ts.TypeOperatorNode): IrType {
  if (node.operator !== ts.SyntaxKind.ReadonlyKeyword) {
    throw new UnsupportedSyntaxError(node);
  }
  return irReadonly(toIrType(node.type));
}

function toCompositeType(node: ts.TypeNode): IrType {
  if (ts.isArrayTypeNode(node)) {
    return irArray(toIrType(node.elementType));
  }
  if (ts.isUnionTypeNode(node)) {
    return irUnion(node.types.map(toIrType));
  }
  if (ts.isIntersectionTypeNode(node)) {
    return irIntersection(node.types.map(toIrType));
  }
  if (ts.isIndexedAccessTypeNode(node)) {
    return irIndexedAccess(toIrType(node.objectType), toIrType(node.indexType));
  }
  if (ts.isTypeLiteralNode(node)) {
    return irObject(node.members.map(toMember));
  }
  throw new UnsupportedSyntaxError(node);
}

/**
 * The printer adds parentheses around unions, intersections and `readonly` operands where needed.
 * Parentheses around any other type mean the generator built a union of one member (`(string)[]`).
 */
function toParenthesizedType(node: ts.ParenthesizedTypeNode): IrType {
  const inner = node.type;
  const isNeeded =
    ts.isUnionTypeNode(inner) || ts.isIntersectionTypeNode(inner) || ts.isTypeOperatorNode(inner);
  return isNeeded ? toIrType(inner) : irUnion([toIrType(inner)]);
}

/**
 * Types the original builds from text: template literal path keys (`pathParamsAsTypes`) and root
 * type aliases, which it writes as `components['schemas']['Name']` with single quotes.
 */
function isTextType(node: ts.TypeNode): boolean {
  return (
    ts.isTemplateLiteralTypeNode(node) ||
    (ts.isIndexedAccessTypeNode(node) && node.getText().includes("'"))
  );
}

/** Convert one type node. */
export function toIrType(node: ts.TypeNode): IrType {
  if (isTextType(node)) {
    return irRaw(node.getText());
  }
  const keyword = KEYWORDS.get(node.kind);
  if (keyword !== undefined) {
    return irKeyword(keyword);
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return toParenthesizedType(node);
  }
  if (ts.isLiteralTypeNode(node)) {
    return toLiteralType(node);
  }
  if (ts.isTypeReferenceNode(node)) {
    return toReference(node);
  }
  if (ts.isTupleTypeNode(node)) {
    return toTupleType(node);
  }
  if (ts.isTypeOperatorNode(node)) {
    return toOperatorType(node);
  }
  return toCompositeType(node);
}

/**
 * The comment as the generator synthesized it. In the file every line after the first is indented
 * to the comment's column; removing that column gives back the synthetic text (` * line`).
 */
function toComment(node: ts.Node): IrComment | null {
  const source = node.getSourceFile();
  const ranges = ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? [];
  const range = ranges.at(-1);
  if (range === undefined) {
    return null;
  }
  const text = source.text.slice(range.pos, range.end);
  if (range.kind === ts.SyntaxKind.SingleLineCommentTrivia) {
    return { kind: "line", text: text.slice(2) };
  }
  const column = source.getLineAndCharacterOfPosition(range.pos).character;
  const [first = "", ...rest] = text.slice(2, -2).split("\n");
  return { kind: "block", text: [first, ...rest.map((line) => line.slice(column))].join("\n") };
}

function hasModifier(node: ts.HasModifiers, kind: ts.SyntaxKind): boolean {
  return ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false;
}

function toPropertyName(name: ts.PropertyName): IrPropertyName {
  if (ts.isIdentifier(name)) {
    return { kind: "identifier", text: name.text };
  }
  if (ts.isStringLiteral(name)) {
    return { kind: "string", value: name.text };
  }
  if (ts.isNumericLiteral(name)) {
    return { kind: "number", text: name.getText() };
  }
  throw new UnsupportedSyntaxError(name);
}

function toIndexSignature(member: ts.IndexSignatureDeclaration): IrMember {
  const [parameter] = member.parameters;
  if (parameter?.type === undefined || !ts.isIdentifier(parameter.name)) {
    throw new UnsupportedSyntaxError(member);
  }
  return {
    kind: "indexSignature",
    parameterName: parameter.name.text,
    parameterType: toIrType(parameter.type),
    type: toIrType(member.type),
    isReadonly: hasModifier(member, ts.SyntaxKind.ReadonlyKeyword),
    comment: toComment(member),
  };
}

function toMember(member: ts.TypeElement): IrMember {
  if (ts.isIndexSignatureDeclaration(member)) {
    return toIndexSignature(member);
  }
  if (!ts.isPropertySignature(member) || member.type === undefined) {
    throw new UnsupportedSyntaxError(member);
  }
  return {
    kind: "property",
    name: toPropertyName(member.name),
    type: toIrType(member.type),
    isOptional: member.questionToken !== undefined,
    isReadonly: hasModifier(member, ts.SyntaxKind.ReadonlyKeyword),
    comment: toComment(member),
  };
}

function toEnumMember(member: ts.EnumMember): IrEnumMember {
  const { initializer } = member;
  if (initializer === undefined) {
    throw new UnsupportedSyntaxError(member);
  }
  const value = ts.isStringLiteral(initializer) ? initializer.text : toNumber(initializer);
  return { name: member.name.getText(), value, comment: toComment(member) };
}

function toConstArray(statement: ts.VariableStatement): IrDeclaration {
  const [variable] = statement.declarationList.declarations;
  const initializer = variable?.initializer;
  if (variable?.type === undefined || initializer === undefined) {
    throw new UnsupportedSyntaxError(statement);
  }
  if (!ts.isArrayLiteralExpression(initializer) || !ts.isIdentifier(variable.name)) {
    throw new UnsupportedSyntaxError(statement);
  }
  const values = initializer.elements.map((element) =>
    ts.isStringLiteral(element) ? element.text : toNumber(element),
  );
  return {
    kind: "constArray",
    name: variable.name.text,
    isExported: hasModifier(statement, ts.SyntaxKind.ExportKeyword),
    type: toIrType(variable.type),
    values,
    comment: toComment(statement),
  };
}

type SupportedStatement =
  | ts.InterfaceDeclaration
  | ts.TypeAliasDeclaration
  | ts.EnumDeclaration
  | ts.VariableStatement;

function toSupportedStatement(statement: ts.Statement): SupportedStatement {
  const isPlainDeclaration =
    (ts.isInterfaceDeclaration(statement) &&
      statement.heritageClauses === undefined &&
      statement.typeParameters === undefined) ||
    (ts.isTypeAliasDeclaration(statement) && statement.typeParameters === undefined) ||
    ts.isEnumDeclaration(statement) ||
    ts.isVariableStatement(statement);
  if (!isPlainDeclaration) {
    throw new UnsupportedSyntaxError(statement);
  }
  return statement as SupportedStatement;
}

/** Generic helpers (`WithRequired`) are injected by the generator as text, so they stay text. */
function isInjectedHelper(statement: ts.Statement): boolean {
  return ts.isTypeAliasDeclaration(statement) && statement.typeParameters !== undefined;
}

/** Convert one top-level statement. */
export function toIrDeclaration(statement: ts.Statement): IrDeclaration {
  if (isInjectedHelper(statement)) {
    return { kind: "rawDeclaration", text: statement.getText() };
  }
  const supported = toSupportedStatement(statement);
  if (ts.isVariableStatement(supported)) {
    return toConstArray(supported);
  }
  const base = {
    name: supported.name.text,
    isExported: hasModifier(supported, ts.SyntaxKind.ExportKeyword),
    comment: toComment(supported),
  };
  switch (supported.kind) {
    case ts.SyntaxKind.InterfaceDeclaration:
      return { kind: "interface", ...base, members: supported.members.map(toMember) };
    case ts.SyntaxKind.TypeAliasDeclaration:
      return { kind: "typeAlias", ...base, type: toIrType(supported.type) };
    case ts.SyntaxKind.EnumDeclaration:
      return { kind: "enum", ...base, members: supported.members.map(toEnumMember) };
    default:
      return assertNever(supported);
  }
}

/** Parse a file body and convert every statement. */
export function parseDeclarations(body: string): IrDeclaration[] {
  const source = ts.createSourceFile("input.ts", body, ts.ScriptTarget.ESNext, true);
  // parseDiagnostics is internal but stable; the public alternative needs a full Program.
  const [diagnostic] = (source as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostic !== undefined) {
    throw new InvalidSourceError(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  }
  return source.statements.map(toIrDeclaration);
}
