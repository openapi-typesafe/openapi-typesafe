import type ts from "typescript";
import { assertNever } from "../../domain/assert-never.js";
import type {
  IrComment,
  IrDeclaration,
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

function toValueExpression(ts: TypeScriptModule, value: string | number): ts.Expression {
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
      return toStringLiteralType(ts, type.value, type.encoding);
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
    case "reference": {
      const typeArguments =
        type.typeArguments.length > 0 ? type.typeArguments.map(convert) : undefined;
      return factory.createTypeReferenceNode(factory.createIdentifier(type.name), typeArguments);
    }
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

function withComments<T extends ts.Node>(
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

function exportModifiers(ts: TypeScriptModule, isExported: boolean): ts.Modifier[] | undefined {
  return isExported ? [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)] : undefined;
}

function toConstArrayStatement(
  ts: TypeScriptModule,
  declaration: Extract<IrDeclaration, { kind: "constArray" }>,
): ts.Statement {
  const initializer = ts.factory.createArrayLiteralExpression(
    declaration.values.map((value) => toValueExpression(ts, value)),
  );
  const variable = ts.factory.createVariableDeclaration(
    declaration.name,
    undefined,
    toTypeNode(ts, declaration.type),
    initializer,
  );
  const list = ts.factory.createVariableDeclarationList([variable], ts.NodeFlags.Const);
  return ts.factory.createVariableStatement(exportModifiers(ts, declaration.isExported), list);
}

/** Parse source text into statements, like the original's `stringToAST`. */
export function parseStatements(ts: TypeScriptModule, text: string): readonly ts.Statement[] {
  return ts.createSourceFile("raw.ts", text, ts.ScriptTarget.ESNext).statements;
}

/** Convert one IR declaration; a raw declaration gives every statement its text holds. */
export function toStatements(ts: TypeScriptModule, declaration: IrDeclaration): ts.Statement[] {
  return declaration.kind === "rawDeclaration"
    ? [...parseStatements(ts, declaration.text)]
    : [toStatement(ts, declaration)];
}

function toEnumStatement(
  ts: TypeScriptModule,
  declaration: Extract<IrDeclaration, { kind: "enum" }>,
): ts.Statement {
  const members = declaration.members.map((member) =>
    withComments(
      ts,
      ts.factory.createEnumMember(member.name, toValueExpression(ts, member.value)),
      member.comments,
    ),
  );
  const modifiers = exportModifiers(ts, declaration.isExported);
  return ts.factory.createEnumDeclaration(modifiers, declaration.name, members);
}

/** Convert one IR declaration. A raw declaration is parsed, like the original's `stringToAST`. */
export function toStatement(ts: TypeScriptModule, declaration: IrDeclaration): ts.Statement {
  const modifiers = exportModifiers(
    ts,
    declaration.kind === "rawDeclaration" ? false : declaration.isExported,
  );
  switch (declaration.kind) {
    case "interface": {
      const members = declaration.members.map((member) => toTypeElement(ts, member));
      const node = ts.factory.createInterfaceDeclaration(
        modifiers,
        declaration.name,
        undefined,
        undefined,
        members,
      );
      return withComments(ts, node, declaration.comments);
    }
    case "typeAlias": {
      const type = toTypeNode(ts, declaration.type);
      const node = ts.factory.createTypeAliasDeclaration(
        modifiers,
        declaration.name,
        undefined,
        type,
      );
      return withComments(ts, node, declaration.comments);
    }
    case "enum":
      return withComments(ts, toEnumStatement(ts, declaration), declaration.comments);
    case "constArray":
      return withComments(ts, toConstArrayStatement(ts, declaration), declaration.comments);
    case "rawDeclaration":
      return parseStatements(ts, declaration.text)[0] as ts.Statement;
    default:
      return assertNever(declaration);
  }
}
