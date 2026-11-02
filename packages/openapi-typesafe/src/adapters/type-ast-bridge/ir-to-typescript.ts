import ts from "typescript";
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

/**
 * Convert IR to TypeScript AST nodes with the same factory calls the original generator makes (see
 * `src/lib/ts.ts`). Printing the result with the TypeScript printer gives the original output,
 * which is how the printer parity tests (ENGINEERING_PLAN 4.3) define "byte-identical"; legacy
 * `ts.Node` callbacks reuse it later (task 6.3).
 */

const factory = ts.factory;

const KEYWORD_KINDS: Readonly<Record<Exclude<IrKeyword, "null">, ts.KeywordTypeSyntaxKind>> = {
  string: ts.SyntaxKind.StringKeyword,
  number: ts.SyntaxKind.NumberKeyword,
  boolean: ts.SyntaxKind.BooleanKeyword,
  undefined: ts.SyntaxKind.UndefinedKeyword,
  unknown: ts.SyntaxKind.UnknownKeyword,
  never: ts.SyntaxKind.NeverKeyword,
};

function toKeywordType(keyword: IrKeyword): ts.TypeNode {
  return keyword === "null"
    ? factory.createLiteralTypeNode(factory.createNull())
    : factory.createKeywordTypeNode(KEYWORD_KINDS[keyword]);
}

/**
 * Numbers as the original writes them: a negative value is a prefix minus on its absolute value.
 */
function toNumberExpression(value: number): ts.PrefixUnaryExpression | ts.NumericLiteral {
  return value < 0
    ? factory.createPrefixUnaryExpression(
        ts.SyntaxKind.MinusToken,
        factory.createNumericLiteral(Math.abs(value)),
      )
    : factory.createNumericLiteral(value);
}

function toValueExpression(value: string | number): ts.Expression {
  return typeof value === "number" ? toNumberExpression(value) : factory.createStringLiteral(value);
}

/** The original writes JSON-encoded literal types as identifiers to keep UTF-8 readable. */
function toStringLiteralType(value: string, encoding: "json" | "escaped"): ts.TypeNode {
  return encoding === "json"
    ? (factory.createIdentifier(JSON.stringify(value)) as unknown as ts.TypeNode)
    : factory.createLiteralTypeNode(factory.createStringLiteral(value));
}

function toTupleElement(element: IrTupleElement): ts.TypeNode {
  const type = toTypeNode(element.type);
  return element.isRest ? factory.createRestTypeNode(type) : type;
}

function toLeafTypeNode(
  type: Extract<
    IrType,
    { kind: "keyword" | "stringLiteral" | "numberLiteral" | "booleanLiteral" | "raw" }
  >,
) {
  switch (type.kind) {
    case "keyword":
      return toKeywordType(type.keyword);
    case "stringLiteral":
      return toStringLiteralType(type.value, type.encoding);
    case "numberLiteral":
      return factory.createLiteralTypeNode(toNumberExpression(type.value));
    case "booleanLiteral":
      return factory.createLiteralTypeNode(
        type.value ? factory.createTrue() : factory.createFalse(),
      );
    case "raw":
      // A node read from TypeScript goes back as it was, so the TypeScript printer indents it.
      return (
        (type.origin as ts.TypeNode | undefined) ??
        (factory.createIdentifier(type.text) as unknown as ts.TypeNode)
      );
    default:
      return assertNever(type);
  }
}

/** Convert one IR type. */
export function toTypeNode(type: IrType): ts.TypeNode {
  switch (type.kind) {
    case "keyword":
    case "stringLiteral":
    case "numberLiteral":
    case "booleanLiteral":
    case "raw":
      return toLeafTypeNode(type);
    case "reference": {
      const typeArguments =
        type.typeArguments.length > 0 ? type.typeArguments.map(toTypeNode) : undefined;
      return factory.createTypeReferenceNode(factory.createIdentifier(type.name), typeArguments);
    }
    case "array":
      return factory.createArrayTypeNode(toTypeNode(type.element));
    case "tuple":
      return factory.createTupleTypeNode(type.elements.map(toTupleElement));
    case "union":
      return factory.createUnionTypeNode(type.types.map(toTypeNode));
    case "intersection":
      return factory.createIntersectionTypeNode(type.types.map(toTypeNode));
    case "object":
      return factory.createTypeLiteralNode(type.members.map(toTypeElement));
    case "indexedAccess":
      return factory.createIndexedAccessTypeNode(toTypeNode(type.object), toTypeNode(type.index));
    case "readonly":
      return factory.createTypeOperatorNode(ts.SyntaxKind.ReadonlyKeyword, toTypeNode(type.type));
    default:
      return assertNever(type);
  }
}

function withComments<T extends ts.Node>(node: T, comments: readonly IrComment[]): T {
  for (const comment of comments) {
    const kind =
      comment.kind === "block"
        ? ts.SyntaxKind.MultiLineCommentTrivia
        : ts.SyntaxKind.SingleLineCommentTrivia;
    ts.addSyntheticLeadingComment(node, kind, comment.text, true);
  }
  return node;
}

function toPropertyName(name: IrPropertyName): ts.PropertyName {
  switch (name.kind) {
    case "identifier":
      return factory.createIdentifier(name.text);
    case "string":
      return factory.createStringLiteral(name.value);
    case "number":
      return factory.createNumericLiteral(name.text);
    default:
      return assertNever(name);
  }
}

function readonlyModifiers(isReadonly: boolean): ts.Modifier[] | undefined {
  return isReadonly ? [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)] : undefined;
}

/** Convert one property signature (for callbacks that receive a `ts.PropertySignature`). */
export function toPropertySignature(property: IrPropertySignature): ts.PropertySignature {
  const questionToken = property.isOptional
    ? factory.createToken(ts.SyntaxKind.QuestionToken)
    : undefined;
  const signature = factory.createPropertySignature(
    readonlyModifiers(property.isReadonly),
    toPropertyName(property.name),
    questionToken,
    toTypeNode(property.type),
  );
  return withComments(signature, property.comments);
}

function toTypeElement(member: IrMember): ts.TypeElement {
  if (member.kind === "property") {
    return toPropertySignature(member);
  }
  const modifiers = readonlyModifiers(member.isReadonly);
  const parameter = factory.createParameterDeclaration(
    undefined,
    undefined,
    member.parameterName,
    undefined,
    toTypeNode(member.parameterType),
  );
  return withComments(
    factory.createIndexSignature(modifiers, [parameter], toTypeNode(member.type)),
    member.comments,
  );
}

function exportModifiers(isExported: boolean): ts.Modifier[] | undefined {
  return isExported ? [factory.createModifier(ts.SyntaxKind.ExportKeyword)] : undefined;
}

function toConstArrayStatement(
  declaration: Extract<IrDeclaration, { kind: "constArray" }>,
): ts.Statement {
  const initializer = factory.createArrayLiteralExpression(
    declaration.values.map(toValueExpression),
  );
  const variable = factory.createVariableDeclaration(
    declaration.name,
    undefined,
    toTypeNode(declaration.type),
    initializer,
  );
  const list = factory.createVariableDeclarationList([variable], ts.NodeFlags.Const);
  return factory.createVariableStatement(exportModifiers(declaration.isExported), list);
}

function parseStatements(text: string): readonly ts.Statement[] {
  return ts.createSourceFile("raw.ts", text, ts.ScriptTarget.ESNext).statements;
}

/** Convert one IR declaration; a raw declaration gives every statement its text holds. */
export function toStatements(declaration: IrDeclaration): ts.Statement[] {
  return declaration.kind === "rawDeclaration"
    ? [...parseStatements(declaration.text)]
    : [toStatement(declaration)];
}

/** Convert one IR declaration. A raw declaration is parsed, like the original's `stringToAST`. */
export function toStatement(declaration: IrDeclaration): ts.Statement {
  switch (declaration.kind) {
    case "interface": {
      const members = declaration.members.map(toTypeElement);
      const node = factory.createInterfaceDeclaration(
        exportModifiers(declaration.isExported),
        declaration.name,
        undefined,
        undefined,
        members,
      );
      return withComments(node, declaration.comments);
    }
    case "typeAlias": {
      const node = factory.createTypeAliasDeclaration(
        exportModifiers(declaration.isExported),
        declaration.name,
        undefined,
        toTypeNode(declaration.type),
      );
      return withComments(node, declaration.comments);
    }
    case "enum": {
      const members = declaration.members.map((member) =>
        withComments(
          factory.createEnumMember(member.name, toValueExpression(member.value)),
          member.comments,
        ),
      );
      return withComments(
        factory.createEnumDeclaration(
          exportModifiers(declaration.isExported),
          declaration.name,
          members,
        ),
        declaration.comments,
      );
    }
    case "constArray":
      return withComments(toConstArrayStatement(declaration), declaration.comments);
    case "rawDeclaration":
      return parseStatements(declaration.text)[0] as ts.Statement;
    default:
      return assertNever(declaration);
  }
}
