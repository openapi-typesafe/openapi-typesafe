import type ts from "typescript";
import { toStatements, toTypeElement, toTypeNode } from "../adapters/type-ast-bridge/ir-to-typescript.js";
import { lazyNode } from "../adapters/type-ast-bridge/lazy-node.js";
import { loadTypeScript, type TypeScriptModule } from "../adapters/type-ast-bridge/load-typescript.js";
import { type AstToStringOptions, printWithTypeScript } from "../adapters/type-ast-bridge/print-typescript.js";
import { type IrPrintable, printFragments } from "../application/print/print-nodes.js";
import { HELPER_TYPES } from "../application/transform/footer/helper-types.js";
import { schemaComment } from "../application/transform/schema-comment.js";
import type { IrDeclaration, IrType } from "../domain/ir/nodes.js";
import { declaresTypeAlias, type FooterEntry } from "./footer-entry.js";
import type { TypeInput } from "./type-helpers.js";

export type { AstToStringOptions } from "../adapters/type-ast-bridge/print-typescript.js";
export type { FooterEntry } from "./footer-entry.js";
export {
  BOOLEAN,
  FALSE,
  NEVER,
  NULL,
  NUMBER,
  type OapiRefOptions,
  oapiRef,
  STRING,
  TRUE,
  type TypeInput,
  tsIntersection,
  tsLiteral,
  tsNullable,
  tsOmit,
  tsRecord,
  tsUnion,
  tsWithRequired,
  UNDEFINED,
  UNKNOWN,
} from "./type-helpers.js";

export const JS_PROPERTY_INDEX_RE = /^[A-Za-z_$][A-Za-z_$0-9]*$/;
export const JS_ENUM_INVALID_CHARS_RE = /[^A-Za-z_$0-9]+(.)?/g;
export const JS_PROPERTY_INDEX_INVALID_CHARS_RE = /[^A-Za-z_$0-9]+/g;
export const SPECIAL_CHARACTER_MAP: Record<string, string> = {
  "+": "Plus",
  // Add more mappings as needed
};

/**
 * The `?` token. Created on first use, so importing the package needs no TypeScript.
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export const QUESTION_TOKEN: ts.QuestionToken = lazyNode(() => {
  const ts = loadTypeScript();
  return ts.factory.createToken(ts.SyntaxKind.QuestionToken);
});

export interface AnnotatedSchemaObject {
  const?: unknown; // jsdoc without value
  default?: unknown; // jsdoc with value
  deprecated?: boolean; // jsdoc without value
  description?: string; // jsdoc with value
  enum?: unknown[]; // jsdoc without value
  example?: string; // jsdoc with value
  examples?: unknown;
  format?: string; // not jsdoc
  nullable?: boolean; // Node information
  summary?: string; // not jsdoc
  title?: string; // not jsdoc
  type?: string | string[]; // Type of node
}

/**
 * Add the schema's JSDoc comment to a TypeScript property signature.
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function addJSDocComment(schemaObject: AnnotatedSchemaObject, node: ts.PropertySignature): void {
  const ts = loadTypeScript();
  const comment = schemaComment(schemaObject);
  if (comment) {
    ts.addSyntheticLeadingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, comment.text, true);
  }
}

/** What `astToString` prints: IR (what `openapiTS` and the transformers return) or TypeScript nodes. */
export type AstToStringInput = IrPrintable | ts.Node | readonly (IrPrintable | ts.Node)[];

function isIrNode(node: IrPrintable | ts.Node): node is IrPrintable {
  return typeof node.kind === "string";
}

/** An IR node in TypeScript form, for printing it together with TypeScript nodes. */
function toTypeScriptNodes(ts: TypeScriptModule, node: IrPrintable): ts.Node[] {
  if (isIrDeclarationKind(node)) {
    return toStatements(ts, node);
  }
  const isMember = node.kind === "property" || node.kind === "indexSignature";
  return [isMember ? toTypeElement(ts, node) : toTypeNode(ts, node)];
}

function isIrDeclarationKind(node: IrPrintable): node is IrDeclaration {
  return ["interface", "typeAlias", "enum", "constArray", "rawDeclaration"].includes(node.kind);
}

/**
 * Print declarations, members or types as a TypeScript file body. IR is printed by our printer;
 * with TypeScript nodes in the input, or with TypeScript printer options, everything goes
 * through the TypeScript printer as before (ADR-004, decision 1).
 */
export function astToString(ast: AstToStringInput, options?: AstToStringOptions): string {
  const nodes: readonly (IrPrintable | ts.Node)[] = Array.isArray(ast) ? ast : [ast as IrPrintable | ts.Node];
  if (nodes.every(isIrNode) && !options) {
    return printFragments(nodes);
  }
  const ts = loadTypeScript();
  const statements = nodes.flatMap((node) => (isIrNode(node) ? toTypeScriptNodes(ts, node) : [node]));
  return printWithTypeScript(ts, statements, options);
}

/** A type argument of the deprecated helpers in TypeScript form; IR (from the type helpers) is converted. */
function legacyTypeNode(type: TypeInput): ts.TypeNode {
  const ts = loadTypeScript();
  return typeof type.kind === "string" ? toTypeNode(ts, type as IrType) : (type as ts.TypeNode);
}

/** Add a helper type alias to the footer once, as a named raw declaration (as the generator does). */
function requireHelper(injectFooter: FooterEntry[], helper: { name: string; text: string }): void {
  if (!injectFooter.some((entry) => declaresTypeAlias(entry, helper.name))) {
    injectFooter.push({ kind: "rawDeclaration", name: helper.name, text: helper.text });
  }
}

/** Convert an arbitrary string to TS (assuming it’s valid) */
export function stringToAST(source: string): unknown[] {
  const ts = loadTypeScript();
  return ts.createSourceFile(
    /* fileName        */ "stringInput",
    /* sourceText      */ source,
    /* languageVersion */ ts.ScriptTarget.ESNext,
    /* setParentNodes  */ undefined,
    /* scriptKind      */ undefined,
  ).statements as any;
}

/**
 * Deduplicate simple primitive types from an array of nodes
 * Note: won’t deduplicate complex types like objects
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function tsDedupe(types: TypeInput[]): ts.TypeNode[] {
  const encounteredTypes = new Set<number>();
  const filteredTypes: ts.TypeNode[] = [];
  for (const t of types.map(legacyTypeNode)) {
    // only mark for deduplication if this is not a const ("text" means it is a const)
    if (!("text" in ((t as ts.LiteralTypeNode).literal ?? t))) {
      const { kind } = (t as ts.LiteralTypeNode).literal ?? t;
      if (encounteredTypes.has(kind)) {
        continue;
      }
      if (tsIsPrimitive(t)) {
        encounteredTypes.add(kind);
      }
    }
    filteredTypes.push(t);
  }
  return filteredTypes;
}

/** @deprecated The generator keeps its own enum registry per run; kept for 1.x (ADR-004). */
export const enumCache = new Map<string, ts.EnumDeclaration>();

/**
 * Create a TS enum (with sanitized name and members)
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function tsEnum(
  name: string,
  members: (string | number)[],
  metadata?: { name?: string; description?: string | null }[],
  options?: { export?: boolean; shouldCache?: boolean },
) {
  const ts = loadTypeScript();
  let enumName = sanitizeMemberName(name);
  enumName = `${enumName[0].toUpperCase()}${enumName.substring(1)}`;
  let key = "";
  if (options?.shouldCache) {
    key = `${members
      .slice(0)
      .sort()
      .map((v, i) => {
        return `${metadata?.[i]?.name ?? String(v)}:${metadata?.[i]?.description || ""}`;
      })
      .join(",")}`;
    if (enumCache.has(key)) {
      return enumCache.get(key) as ts.EnumDeclaration;
    }
  }
  const enumDeclaration = ts.factory.createEnumDeclaration(
    /* modifiers */ options ? tsModifiers({ export: options.export ?? false }) : undefined,
    /* name      */ enumName,
    /* members   */ members.map((value, i) => tsEnumMember(value, metadata?.[i])),
  );
  options?.shouldCache && enumCache.set(key, enumDeclaration);
  return enumDeclaration;
}

/**
 * Create an exported TS array literal expression
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function tsArrayLiteralExpression(
  name: string,
  elementType: TypeInput,
  values: (string | number)[],
  options?: { export?: boolean; readonly?: boolean; injectFooter?: FooterEntry[] },
) {
  const ts = loadTypeScript();
  let variableName = sanitizeMemberName(name);
  variableName = `${variableName[0].toLowerCase()}${variableName.substring(1)}`;

  if (options?.injectFooter) {
    requireHelper(options.injectFooter, HELPER_TYPES.flattenedDeepRequired);
  }

  const arrayType = options?.readonly
    ? tsReadonlyArray(elementType, options.injectFooter)
    : ts.factory.createArrayTypeNode(legacyTypeNode(elementType));

  return ts.factory.createVariableStatement(
    options ? tsModifiers({ export: options.export ?? false }) : undefined,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          variableName,
          undefined,
          arrayType,
          ts.factory.createArrayLiteralExpression(
            values.map((value) => {
              if (typeof value === "number") {
                if (value < 0) {
                  return ts.factory.createPrefixUnaryExpression(
                    ts.SyntaxKind.MinusToken,
                    ts.factory.createNumericLiteral(Math.abs(value)),
                  );
                } else {
                  return ts.factory.createNumericLiteral(value);
                }
              } else {
                return ts.factory.createStringLiteral(value);
              }
            }),
          ),
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
}

function sanitizeMemberName(name: string) {
  let sanitizedName = name.replace(JS_ENUM_INVALID_CHARS_RE, (c) => {
    const last = c[c.length - 1];
    return JS_PROPERTY_INDEX_INVALID_CHARS_RE.test(last) ? "" : last.toUpperCase();
  });
  if (Number(name[0]) >= 0) {
    sanitizedName = `Value${name}`;
  }
  return sanitizedName;
}

/**
 * Sanitize TS enum member expression
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function tsEnumMember(value: string | number, metadata: { name?: string; description?: string | null } = {}) {
  const ts = loadTypeScript();
  let name = metadata.name ?? String(value);
  if (!JS_PROPERTY_INDEX_RE.test(name)) {
    if (Number(name[0]) >= 0) {
      name = `Value${name}`.replace(".", "_"); // don't forged decimals;
    } else if (name[0] === "-") {
      name = `ValueMinus${name.slice(1)}`;
    }

    const invalidCharMatch = name.match(JS_PROPERTY_INDEX_INVALID_CHARS_RE);
    if (invalidCharMatch) {
      if (invalidCharMatch[0] === name) {
        name = `"${name}"`;
      } else {
        name = name.replace(JS_PROPERTY_INDEX_INVALID_CHARS_RE, (s) => {
          return s in SPECIAL_CHARACTER_MAP ? SPECIAL_CHARACTER_MAP[s] : "_";
        });
      }
    }
  }

  let member: ts.EnumMember;
  if (typeof value === "number") {
    const literal =
      value < 0
        ? ts.factory.createPrefixUnaryExpression(
            ts.SyntaxKind.MinusToken,
            ts.factory.createNumericLiteral(Math.abs(value)),
          )
        : ts.factory.createNumericLiteral(value);

    member = ts.factory.createEnumMember(name, literal);
  } else {
    member = ts.factory.createEnumMember(name, ts.factory.createStringLiteral(value));
  }

  const trimmedDescription = metadata.description?.trim();
  if (trimmedDescription === undefined || trimmedDescription === null || trimmedDescription === "") {
    return member;
  }

  return ts.addSyntheticLeadingComment(member, ts.SyntaxKind.SingleLineCommentTrivia, ` ${trimmedDescription}`, true);
}

/**
 * Is this a primitive type (string, number, boolean, null, undefined)?
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function tsIsPrimitive(input: TypeInput): boolean {
  const ts = loadTypeScript();
  if (!input) {
    return true;
  }
  const type = legacyTypeNode(input);
  return (
    ts.SyntaxKind[type.kind] === "BooleanKeyword" ||
    ts.SyntaxKind[type.kind] === "NeverKeyword" ||
    ts.SyntaxKind[type.kind] === "NullKeyword" ||
    ts.SyntaxKind[type.kind] === "NumberKeyword" ||
    ts.SyntaxKind[type.kind] === "StringKeyword" ||
    ts.SyntaxKind[type.kind] === "UndefinedKeyword" ||
    ("literal" in type && tsIsPrimitive(type.literal as ts.TypeLiteralNode))
  );
}

/**
 * Modifiers (readonly)
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function tsModifiers(modifiers: { readonly?: boolean; export?: boolean }): ts.Modifier[] {
  const ts = loadTypeScript();
  const typeMods: ts.Modifier[] = [];
  if (modifiers.export) {
    typeMods.push(ts.factory.createModifier(ts.SyntaxKind.ExportKeyword));
  }
  if (modifiers.readonly) {
    typeMods.push(ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword));
  }
  return typeMods;
}

/**
 * Create a valid property index
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function tsPropertyIndex(index: string | number) {
  const ts = loadTypeScript();
  if (
    (typeof index === "number" && !(index < 0)) ||
    (typeof index === "string" && String(Number(index)) === index && index[0] !== "-")
  ) {
    return ts.factory.createNumericLiteral(index);
  }
  return typeof index === "string" && JS_PROPERTY_INDEX_RE.test(index)
    ? ts.factory.createIdentifier(index)
    : ts.factory.createStringLiteral(String(index));
}

/**
 * Enhanced ReadonlyArray.
 * eg: type Foo = ReadonlyArray<T>; type Bar = ReadonlyArray<T[]>
 * Foo and Bar are both of type `readonly T[]`
 * @deprecated Kept for 1.x; removed in 2.0 (ADR-004, decision 9).
 */
export function tsReadonlyArray(type: TypeInput, injectFooter?: FooterEntry[]): ts.TypeNode {
  const ts = loadTypeScript();
  if (injectFooter) {
    requireHelper(injectFooter, HELPER_TYPES.readonlyArray);
  }
  return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("ReadonlyArray"), [legacyTypeNode(type)]);
}
