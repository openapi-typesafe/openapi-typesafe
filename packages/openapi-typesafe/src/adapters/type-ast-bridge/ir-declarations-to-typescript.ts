import type ts from "typescript";
import { assertNever } from "../../domain/assert-never.js";
import type { IrDeclaration } from "../../domain/ir/nodes.js";
import { toTypeElement, toTypeNode, toValueExpression, withComments } from "./ir-to-typescript.js";
import type { TypeScriptModule } from "./load-typescript.js";

/**
 * Convert IR declarations to TypeScript statements, with the factory calls the original makes
 * (see `ir-to-typescript.ts` for types and members).
 */

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

function toInterfaceStatement(
  ts: TypeScriptModule,
  declaration: Extract<IrDeclaration, { kind: "interface" }>,
): ts.Statement {
  const members = declaration.members.map((member) => toTypeElement(ts, member));
  const modifiers = exportModifiers(ts, declaration.isExported);
  return ts.factory.createInterfaceDeclaration(
    modifiers,
    declaration.name,
    undefined,
    undefined,
    members,
  );
}

function toTypeAliasStatement(
  ts: TypeScriptModule,
  declaration: Extract<IrDeclaration, { kind: "typeAlias" }>,
): ts.Statement {
  const type = toTypeNode(ts, declaration.type);
  const modifiers = exportModifiers(ts, declaration.isExported);
  return ts.factory.createTypeAliasDeclaration(modifiers, declaration.name, undefined, type);
}

/** Convert one IR declaration. A raw declaration is parsed, like the original's `stringToAST`. */
export function toStatement(ts: TypeScriptModule, declaration: IrDeclaration): ts.Statement {
  switch (declaration.kind) {
    case "interface":
      return withComments(ts, toInterfaceStatement(ts, declaration), declaration.comments);
    case "typeAlias":
      return withComments(ts, toTypeAliasStatement(ts, declaration), declaration.comments);
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
