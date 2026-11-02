/**
 * Type IR: the closed set of immutable nodes that describes the TypeScript types and declarations
 * the generator emits (ENGINEERING_PLAN §4.2, ADR-002). Nodes are plain readonly data with a `kind`
 * discriminator; every consumer dispatches with an exhaustive `switch`, so a new kind breaks the
 * build wherever it must be handled.
 *
 * Utility types (`Omit`, `Record`, `WithRequired`, `Extract`) are `reference` nodes with type
 * arguments, built by named constructors: the printer has nothing special to do for them.
 */

/** Keyword types. `null` is a keyword here; TypeScript models it as a literal type. */
export type IrKeyword =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "unknown"
  | "never";

/**
 * How a string literal is written.
 * - `json`: `JSON.stringify` text, non-ASCII kept as is. The original writes literal types this way
 *   to keep UTF-8 readable (TypeScript issue 36174).
 * - `escaped`: TypeScript printer escaping, non-ASCII as `\uXXXX`. The original writes
 *   indexed-access keys and quoted property names this way.
 */
export type IrStringEncoding = "json" | "escaped";

export interface IrKeywordType {
  readonly kind: "keyword";
  readonly keyword: IrKeyword;
}

export interface IrStringLiteralType {
  readonly kind: "stringLiteral";
  readonly value: string;
  readonly encoding: IrStringEncoding;
}

/** Finite number; a negative value prints with a leading minus sign. */
export interface IrNumberLiteralType {
  readonly kind: "numberLiteral";
  readonly value: number;
}

export interface IrBooleanLiteralType {
  readonly kind: "booleanLiteral";
  readonly value: boolean;
}

/** A named type, optionally with type arguments: `components`, `Record<string, never>`. */
export interface IrReferenceType {
  readonly kind: "reference";
  readonly name: string;
  readonly typeArguments: readonly IrType[];
}

export interface IrArrayType {
  readonly kind: "array";
  readonly element: IrType;
}

/** A tuple element; `isRest` prints `...T`. */
export interface IrTupleElement {
  readonly type: IrType;
  readonly isRest: boolean;
}

export interface IrTupleType {
  readonly kind: "tuple";
  readonly elements: readonly IrTupleElement[];
}

export interface IrUnionType {
  readonly kind: "union";
  readonly types: readonly IrType[];
}

export interface IrIntersectionType {
  readonly kind: "intersection";
  readonly types: readonly IrType[];
}

export interface IrObjectType {
  readonly kind: "object";
  readonly members: readonly IrMember[];
}

/** `object[index]`, for example `components["schemas"]`. */
export interface IrIndexedAccessType {
  readonly kind: "indexedAccess";
  readonly object: IrType;
  readonly index: IrType;
}

/** `readonly T` (the only type operator the generator emits). */
export interface IrReadonlyType {
  readonly kind: "readonly";
  readonly type: IrType;
}

/**
 * Text printed as is. Escape hatch for types that come from outside the IR, for example output of
 * legacy `ts.Node` callbacks converted by the type-AST bridge (ENGINEERING_PLAN 6.3). The text is
 * written as if it started at column 0: each line after the first gets the indentation of the
 * position where the type is printed. Known limit: this also indents the continuation lines of a
 * template literal that spans lines, which TypeScript keeps verbatim (ADR-004).
 */
export interface IrRawType {
  readonly kind: "raw";
  readonly text: string;
  /**
   * The outside node the text was printed from, opaque to the IR. While the Node API still
   * returns `ts.Node`s (until Phase 6), the bridge hands this node back unchanged, exactly as the
   * original did. Removed with the reverse bridge in Phase 6.
   */
  readonly origin?: unknown;
}

export type IrType =
  | IrKeywordType
  | IrStringLiteralType
  | IrNumberLiteralType
  | IrBooleanLiteralType
  | IrReferenceType
  | IrArrayType
  | IrTupleType
  | IrUnionType
  | IrIntersectionType
  | IrObjectType
  | IrIndexedAccessType
  | IrReadonlyType
  | IrRawType;

/** A comment printed on its own line before a node; a node may have several, printed in order. */
export type IrComment =
  /** `/*text*\/`: `text` is the comment body, for example `* @description Hello `. */
  | { readonly kind: "block"; readonly text: string }
  /** `//text`. */
  | { readonly kind: "line"; readonly text: string };

/** Property key: identifier, quoted string, or number, as decided by `toPropertyName`. */
export type IrPropertyName =
  | { readonly kind: "identifier"; readonly text: string }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "number"; readonly text: string };

export interface IrPropertySignature {
  readonly kind: "property";
  readonly name: IrPropertyName;
  readonly type: IrType;
  readonly isOptional: boolean;
  readonly isReadonly: boolean;
  readonly comments: readonly IrComment[];
}

/** `[parameterName: parameterType]: type`. */
export interface IrIndexSignature {
  readonly kind: "indexSignature";
  readonly parameterName: string;
  readonly parameterType: IrType;
  readonly type: IrType;
  readonly isReadonly: boolean;
  readonly comments: readonly IrComment[];
}

export type IrMember = IrPropertySignature | IrIndexSignature;

export interface IrInterfaceDeclaration {
  readonly kind: "interface";
  readonly name: string;
  readonly isExported: boolean;
  readonly members: readonly IrMember[];
  readonly comments: readonly IrComment[];
}

export interface IrTypeAliasDeclaration {
  readonly kind: "typeAlias";
  readonly name: string;
  readonly isExported: boolean;
  readonly type: IrType;
  readonly comments: readonly IrComment[];
}

/** `name` is printed as given (already sanitized or quoted by the enum naming rules). */
export interface IrEnumMember {
  readonly name: string;
  readonly value: string | number;
  readonly comments: readonly IrComment[];
}

export interface IrEnumDeclaration {
  readonly kind: "enum";
  readonly name: string;
  readonly isExported: boolean;
  readonly members: readonly IrEnumMember[];
  readonly comments: readonly IrComment[];
}

/** `const name: type = [values];` (the `--enum-values` and `--make-paths-enum` arrays). */
export interface IrConstArrayDeclaration {
  readonly kind: "constArray";
  readonly name: string;
  readonly isExported: boolean;
  readonly type: IrType;
  readonly values: readonly (string | number)[];
  readonly comments: readonly IrComment[];
}

/** A declaration printed as is: footer helpers and injected code. */
export interface IrRawDeclaration {
  readonly kind: "rawDeclaration";
  readonly text: string;
}

export type IrDeclaration =
  | IrInterfaceDeclaration
  | IrTypeAliasDeclaration
  | IrEnumDeclaration
  | IrConstArrayDeclaration
  | IrRawDeclaration;
