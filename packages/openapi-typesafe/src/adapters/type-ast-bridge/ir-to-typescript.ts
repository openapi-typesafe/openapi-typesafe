import type ts from "typescript";
import { assertNever } from "../../domain/assert-never.js";
import { DEFAULT_STRING_ENCODING } from "../../domain/ir/constructors.js";
import type {
  IrComment,
  IrKeyword,
  IrMember,
  IrPropertyName,
  IrPropertySignature,
  IrTupleElement,
  IrType,
} from "../../domain/ir/nodes.js";
import type { TypeScriptModule } from "./load-typescript.js";

/**
 * Convert IR to TypeScript AST nodes with the same factory calls the original generator makes.
 * Printing the result with the TypeScript printer gives the original output, which is how the
 * printer parity tests (ENGINEERING_PLAN 4.3) define "byte-identical". Every function takes the
 * TypeScript module to build with (ADR-004, decision 4): the nodes must come from the same module
 * that later reads or prints them.
 */

type KeywordName = Exclude<IrKeyword, "null">;

function keywordKind(ts: TypeScriptModule, keyword: KeywordName): ts.KeywordTypeSyntaxKind {
  const kinds: Readonly<Record<KeywordName, ts.KeywordTypeSyntaxKind>> = {
    string: ts.SyntaxKind.StringKeyword,
    number: ts.SyntaxKind.NumberKeyword,
    boolean: ts.SyntaxKind.BooleanKeyword,
    undefined: ts.SyntaxKind.UndefinedKeyword,
    unknown: ts.SyntaxKind.UnknownKeyword,
    never: ts.SyntaxKind.NeverKeyword,
  };
  return kinds[keyword];
}

function toKeywordType(ts: TypeScriptModule, keyword: IrKeyword): ts.TypeNode {
  return keyword === "null"
    ? ts.factory.createLiteralTypeNode(ts.factory.createNull())
    : ts.factory.createKeywordTypeNode(keywordKind(ts, keyword));
}

/**
 * Numbers as the original writes them: a negative value is a prefix minus on its absolute value.
 */
function toNumberExpression(
  ts: TypeScriptModule,
  value: number,
): ts.PrefixUnaryExpression | ts.NumericLiteral {
  return value < 0
    ? ts.factory.createPrefixUnaryExpression(
        ts.SyntaxKind.MinusToken,
        ts.factory.createNumericLiteral(Math.abs(value)),
      )
    : ts.factory.createNumericLiteral(value);
}

/** An enum member or array element value, written as the original writes it. */
export function toValueExpression(ts: TypeScriptModule, value: string | number): ts.Expression {
  return typeof value === "number"
    ? toNumberExpression(ts, value)
    : ts.factory.createStringLiteral(value);
}

/** The original writes JSON-encoded literal types as identifiers to keep UTF-8 readable. */
function toStringLiteralType(
  ts: TypeScriptModule,
  value: string,
  encoding: "json" | "escaped",
): ts.TypeNode {
  return encoding === "json"
    ? (ts.factory.createIdentifier(JSON.stringify(value)) as unknown as ts.TypeNode)
    : ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(value));
}

function toTupleElement(ts: TypeScriptModule, element: IrTupleElement): ts.TypeNode {
  const type = toTypeNode(ts, element.type);
  if (element.isOptional) {
    return ts.factory.createOptionalTypeNode(type);
  }
  return element.isRest ? ts.factory.createRestTypeNode(type) : type;
}

type LeafType = Extract<
  IrType,
  { kind: "keyword" | "stringLiteral" | "numberLiteral" | "booleanLiteral" | "raw" }
>;

function toLeafTypeNode(ts: TypeScriptModule, type: LeafType): ts.TypeNode {
  switch (type.kind) {
    case "keyword":
      return toKeywordType(ts, type.keyword);
    case "stringLiteral":
      return toStringLiteralType(ts, type.value, type.encoding ?? DEFAULT_STRING_ENCODING);
    case "numberLiteral":
      return ts.factory.createLiteralTypeNode(toNumberExpression(ts, type.value));
    case "booleanLiteral":
      return ts.factory.createLiteralTypeNode(
        type.value ? ts.factory.createTrue() : ts.factory.createFalse(),
      );
    case "raw":
      // A node read from TypeScript goes back as it was, so the TypeScript printer indents it.
      return (
        (type.origin as ts.TypeNode | undefined) ??
        (ts.factory.createIdentifier(type.text) as unknown as ts.TypeNode)
      );
    default:
      return assertNever(type);
  }
}

function toReferenceNode(
  ts: TypeScriptModule,
  type: Extract<IrType, { kind: "reference" }>,
): ts.TypeNode {
  const typeArguments =
    type.typeArguments.length > 0
      ? type.typeArguments.map((argument) => toTypeNode(ts, argument))
      : undefined;
  return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier(type.name), typeArguments);
}

/** Convert one IR type. */
export function toTypeNode(ts: TypeScriptModule, type: IrType): ts.TypeNode {
  const convert = (inner: IrType) => toTypeNode(ts, inner);
  const { factory } = ts;
  switch (type.kind) {
    case "keyword":
    case "stringLiteral":
    case "numberLiteral":
    case "booleanLiteral":
    case "raw":
      return toLeafTypeNode(ts, type);
    case "reference":
      return toReferenceNode(ts, type);
    case "array":
      return factory.createArrayTypeNode(convert(type.element));
    case "tuple":
      return factory.createTupleTypeNode(
        type.elements.map((element) => toTupleElement(ts, element)),
      );
    case "union":
      return factory.createUnionTypeNode(type.types.map(convert));
    case "intersection":
      return factory.createIntersectionTypeNode(type.types.map(convert));
    case "object":
      return factory.createTypeLiteralNode(type.members.map((member) => toTypeElement(ts, member)));
    case "indexedAccess":
      return factory.createIndexedAccessTypeNode(convert(type.object), convert(type.index));
    case "readonly":
      return factory.createTypeOperatorNode(ts.SyntaxKind.ReadonlyKeyword, convert(type.type));
    default:
      return assertNever(type);
  }
}

/** Attach IR comments to a node as synthetic leading comments, as the original does. */
export function withComments<T extends ts.Node>(
  ts: TypeScriptModule,
  node: T,
  comments: readonly IrComment[],
): T {
  for (const comment of comments) {
    const kind =
      comment.kind === "block"
        ? ts.SyntaxKind.MultiLineCommentTrivia
        : ts.SyntaxKind.SingleLineCommentTrivia;
    ts.addSyntheticLeadingComment(node, kind, comment.text, true);
  }
  return node;
}

function toPropertyName(ts: TypeScriptModule, name: IrPropertyName): ts.PropertyName {
  switch (name.kind) {
    case "identifier":
      return ts.factory.createIdentifier(name.text);
    case "string":
      return ts.factory.createStringLiteral(name.value);
    case "number":
      return ts.factory.createNumericLiteral(name.text);
    default:
      return assertNever(name);
  }
}

function readonlyModifiers(ts: TypeScriptModule, isReadonly: boolean): ts.Modifier[] | undefined {
  return isReadonly ? [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)] : undefined;
}

/** Convert one property signature (for callbacks that receive a `ts.PropertySignature`). */
export function toPropertySignature(
  ts: TypeScriptModule,
  property: IrPropertySignature,
): ts.PropertySignature {
  const questionToken = property.isOptional
    ? ts.factory.createToken(ts.SyntaxKind.QuestionToken)
    : undefined;
  const signature = ts.factory.createPropertySignature(
    readonlyModifiers(ts, property.isReadonly),
    toPropertyName(ts, property.name),
    questionToken,
    toTypeNode(ts, property.type),
  );
  return withComments(ts, signature, property.comments);
}

export function toTypeElement(ts: TypeScriptModule, member: IrMember): ts.TypeElement {
  if (member.kind === "property") {
    return toPropertySignature(ts, member);
  }
  const parameter = ts.factory.createParameterDeclaration(
    undefined,
    undefined,
    member.parameterName,
    undefined,
    toTypeNode(ts, member.parameterType),
  );
  const signature = ts.factory.createIndexSignature(
    readonlyModifiers(ts, member.isReadonly),
    [parameter],
    toTypeNode(ts, member.type),
  );
  return withComments(ts, signature, member.comments);
}
