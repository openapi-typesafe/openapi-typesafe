import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { toTypeNode } from "../../src/adapters/type-ast-bridge/ir-to-typescript.js";
import { printTypeScriptNode } from "../../src/adapters/type-ast-bridge/typescript-raw-text.js";
import {
  fromPropertySignature,
  fromTypeNode,
} from "../../src/adapters/type-ast-bridge/typescript-to-ir.js";
import { printNodes } from "../../src/application/print/print-nodes.js";
import { irKeyword } from "../../src/domain/ir/constructors.js";
import type { IrType } from "../../src/domain/ir/nodes.js";
import { arbitraryType } from "./ir-arbitraries.js";
import { NULL, STRING, stringToAST, tsLiteral, tsUnion } from "./original/lib/ts.js";
import { alias } from "./print-parity.fixtures.js";

const factory = ts.factory;
const RUNS = 2_000;

/** What the original prints for a type node in an alias: `type T = <node>;`. */
function printOriginal(node: ts.TypeNode): string {
  const statement = factory.createTypeAliasDeclaration(undefined, "T", undefined, node);
  return `${printTypeScriptNode(ts, statement)}\n`;
}

function printConverted(node: ts.TypeNode): string {
  return printNodes([alias("T", fromTypeNode(ts, node))]).replace(/^export /, "");
}

describe("fromTypeNode", () => {
  it("fromTypeNode of factory nodes built from random IR prints like TypeScript", () => {
    fc.assert(
      fc.property(arbitraryType, (type: IrType) => {
        const node = toTypeNode(ts, type);

        expect(printConverted(node)).toBe(printOriginal(node));
      }),
      { numRuns: RUNS },
    );
  });

  it.each<[string, () => ts.TypeNode]>([
    ["legacy helpers", () => tsUnion([STRING, NULL, tsLiteral("é")])],
    ["explicit parentheses", () => factory.createParenthesizedType(STRING)],
    [
      "union in parentheses in a property",
      () =>
        factory.createTypeLiteralNode([
          factory.createPropertySignature(
            undefined,
            "a",
            undefined,
            factory.createParenthesizedType(factory.createUnionTypeNode([STRING, NULL])),
          ),
        ]),
    ],
    [
      "readonly of a readonly tuple in a property (multi-line, needs the indentation)",
      () =>
        factory.createTypeLiteralNode([
          factory.createPropertySignature(
            undefined,
            "a",
            undefined,
            factory.createTypeOperatorNode(
              ts.SyntaxKind.ReadonlyKeyword,
              factory.createTypeOperatorNode(
                ts.SyntaxKind.ReadonlyKeyword,
                factory.createTupleTypeNode([]),
              ),
            ),
          ),
        ]),
    ],
    [
      "factory parentheses in an array",
      () => factory.createArrayTypeNode(factory.createUnionTypeNode([STRING, NULL])),
    ],
    [
      "single-quoted string",
      () => factory.createLiteralTypeNode(factory.createStringLiteral("a", true)),
    ],
    [
      "non-canonical number",
      () => factory.createLiteralTypeNode(factory.createNumericLiteral("1.50")),
    ],
    [
      "negative zero",
      () =>
        factory.createLiteralTypeNode(
          factory.createPrefixUnaryExpression(
            ts.SyntaxKind.MinusToken,
            factory.createNumericLiteral(0),
          ),
        ),
    ],
    [
      "qualified name",
      () =>
        factory.createTypeReferenceNode(
          factory.createQualifiedName(factory.createIdentifier("A"), "B"),
        ),
    ],
    [
      "function type",
      () =>
        factory.createFunctionTypeNode(
          undefined,
          [],
          factory.createKeywordTypeNode(ts.SyntaxKind.VoidKeyword),
        ),
    ],
    [
      "parsed node",
      () => (stringToAST("type X = 'a' | Array<B>;")[0] as ts.TypeAliasDeclaration).type,
    ],
    [
      "optional tuple element",
      () => factory.createTupleTypeNode([factory.createOptionalTypeNode(STRING)]),
    ],
    [
      "commented property",
      () => {
        const property = factory.createPropertySignature(undefined, "id", undefined, STRING);
        ts.addSyntheticLeadingComment(
          property,
          ts.SyntaxKind.MultiLineCommentTrivia,
          "* Id ",
          true,
        );
        return factory.createTypeLiteralNode([property]);
      },
    ],
    [
      "comment without trailing line break",
      () => {
        const property = factory.createPropertySignature(undefined, "id", undefined, STRING);
        ts.addSyntheticLeadingComment(property, ts.SyntaxKind.MultiLineCommentTrivia, "x", false);
        return factory.createTypeLiteralNode([property]);
      },
    ],
    [
      "method signature",
      () =>
        factory.createTypeLiteralNode([
          factory.createMethodSignature(undefined, "m", undefined, undefined, [], STRING),
        ]),
    ],
  ])("fromTypeNode of %s prints like TypeScript", (_name, build) => {
    const node = build();

    expect(printConverted(node)).toBe(printOriginal(node));
  });

  it("fromTypeNode of a node kept as text converts back to the same node", () => {
    const [declaration] = stringToAST("type X = {\n  a: string;\n};");
    const node = (declaration as ts.TypeAliasDeclaration).type;

    const type = fromTypeNode(ts, node);

    expect(type.kind).toBe("raw");
    expect(toTypeNode(ts, type)).toBe(node);
  });

  it("fromTypeNode keeps IR nodes found inside a TypeScript tree", () => {
    const never = irKeyword("never");
    const node = factory.createArrayTypeNode(never as unknown as ts.TypeNode);

    expect(fromTypeNode(ts, node)).toEqual({ kind: "array", element: never });
  });

  it("printTypeScriptNode prints IR nodes found inside a TypeScript tree", () => {
    const node = factory.createTypeOperatorNode(
      ts.SyntaxKind.KeyOfKeyword,
      irKeyword("never") as unknown as ts.TypeNode,
    );

    expect(printTypeScriptNode(ts, node)).toBe("keyof never");
  });
});

describe("fromPropertySignature", () => {
  it("fromPropertySignature reads name, flags, type and comments", () => {
    const property = factory.createPropertySignature(
      [factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
      factory.createStringLiteral("a-b"),
      factory.createToken(ts.SyntaxKind.QuestionToken),
      STRING,
    );
    ts.addSyntheticLeadingComment(property, ts.SyntaxKind.SingleLineCommentTrivia, " x", true);

    expect(fromPropertySignature(ts, property)).toEqual({
      kind: "property",
      name: { kind: "string", value: "a-b" },
      type: irKeyword("string"),
      isOptional: true,
      isReadonly: true,
      comments: [{ kind: "line", text: " x" }],
    });
  });

  it("fromPropertySignature without a type is null", () => {
    expect(
      fromPropertySignature(
        ts,
        factory.createPropertySignature(undefined, "a", undefined, undefined),
      ),
    ).toBeNull();
  });
});
