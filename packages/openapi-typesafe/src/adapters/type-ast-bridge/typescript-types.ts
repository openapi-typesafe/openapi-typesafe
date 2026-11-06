import type * as TypeScript from "typescript";

/**
 * The TypeScript compiler's node types for code outside the bridge and for the public
 * declarations (ADR-004, decision 4; ADR-031). Type-only: importing it never loads TypeScript.
 *
 * Each type is read from the compiler API of the `typescript` package the consumer has installed
 * (`factory`, `createPrinter`), not named as `ts.Node`. TypeScript 5.x and 6.x have that API, so
 * the types are the compiler's own. TypeScript 7's `typescript` package exports only `version`;
 * `ts.Node` there is error TS2694 in a consumer that checks declarations (`skipLibCheck: false`).
 */

type Api = typeof TypeScript;
type Factory = Api extends { readonly factory: infer F } ? F : undefined;

/**
 * A compiler type when the installed `typescript` has no compiler API (TypeScript 7). It is `any`
 * because that is what these types already were for such a consumer with `skipLibCheck: true`
 * (an unresolved type in a declaration file is `any`), so callbacks that build or read nodes of
 * `@typescript/typescript6` keep compiling (ADR-031). The cost, as before: a union with a node
 * type, such as the result of `transform`, accepts any value there.
 */
type WithoutCompilerApi = any;

/** The node type that `factory[Name]` returns, or `WithoutCompilerApi`. */
type Created<Name extends string> = Factory extends {
  readonly [Key in Name]: (...args: never[]) => infer Result;
}
  ? Result
  : WithoutCompilerApi;

type ModifierList = Created<"createModifiersFromModifierFlags">;

/** The compiler node types the package names; see the module comment. */
export declare namespace ts {
  type Node = Api extends { isTypeNode(node: infer N): boolean } ? N : WithoutCompilerApi;
  type TypeNode = Factory extends { createArrayTypeNode(elementType: infer T): unknown }
    ? T
    : WithoutCompilerApi;
  type QuestionToken = Factory extends {
    createPropertySignature(modifiers: never, name: never, token: infer Q, type: never): unknown;
  }
    ? NonNullable<Q>
    : WithoutCompilerApi;
  type Modifier = ModifierList extends readonly (infer M)[] | undefined ? M : WithoutCompilerApi;
  type PrinterOptions = Api extends { createPrinter(options?: infer O, ...rest: never[]): unknown }
    ? NonNullable<O>
    : WithoutCompilerApi;
  type PropertySignature = Created<"createPropertySignature">;
  type LiteralTypeNode = Created<"createLiteralTypeNode">;
  type TypeLiteralNode = Created<"createTypeLiteralNode">;
  type InterfaceDeclaration = Created<"createInterfaceDeclaration">;
  type EnumDeclaration = Created<"createEnumDeclaration">;
  type EnumMember = Created<"createEnumMember">;
  type VariableStatement = Created<"createVariableStatement">;
  type Identifier = Created<"createIdentifier">;
  type NumericLiteral = Created<"createNumericLiteral">;
  type StringLiteral = Created<"createStringLiteral">;
}
