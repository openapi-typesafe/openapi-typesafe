import { describe, expect, it } from "vitest";
import { createTypescriptCallbackRewriter } from "../../src/adapters/typescript-parser/rewriter.js";

const rewriter = createTypescriptCallbackRewriter();
const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

const HEADER = [
  'import ts from "typescript";',
  'import openapiTS, { astToString } from "openapi-typesafe";',
];

/** A file with one `openapiTS` call whose `transform` returns `returned`. */
function transformFile(returned: string, header: readonly string[] = HEADER): string {
  return lines(...header, "await openapiTS(schema, {", `  transform: () => ${returned},`, "});");
}

/** The rewritten return of `transformFile`, or undefined when the file was left. */
function rewrittenReturn(returned: string, header?: readonly string[]): string | undefined {
  const migration = rewriter.rewrite(transformFile(returned, header), "gen.ts");
  const match = /transform: \(\) => (.*),\n/.exec(migration.text);
  return migration.changes.length === 0 ? undefined : match?.[1];
}

describe("TypescriptCallbackRewriter", () => {
  it("rewrite turns factory returns into type text and adds irCallbacks", () => {
    const text = lines(
      ...HEADER,
      'const DATE = ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Date"));',
      "const NULL_TYPE = ts.factory.createLiteralTypeNode(ts.factory.createNull());",
      "const ast = await openapiTS(schema, {",
      "  transform(schemaObject) {",
      '    if (schemaObject.format === "date-time") {',
      "      return schemaObject.nullable ? ts.factory.createUnionTypeNode([DATE, NULL_TYPE]) : DATE;",
      "    }",
      "    const inner = () => ts.factory.createTypeReferenceNode(name);",
      "  },",
      "});",
    );

    const migration = rewriter.rewrite(text, "src/generate.ts");

    expect(migration.text).toBe(
      lines(
        ...HEADER,
        'const DATE = ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("Date"));',
        "const NULL_TYPE = ts.factory.createLiteralTypeNode(ts.factory.createNull());",
        "const ast = await openapiTS(schema, {",
        "  irCallbacks: true,",
        "  transform(schemaObject) {",
        '    if (schemaObject.format === "date-time") {',
        '      return schemaObject.nullable ? "Date | null" : "Date";',
        "    }",
        "    const inner = () => ts.factory.createTypeReferenceNode(name);",
        "  },",
        "});",
      ),
    );
    expect(migration.changes).toEqual([{ kind: "transform-rewritten", line: 6 }]);
    expect(migration.manualSteps).toEqual([]);
  });

  it.each([
    ['ts.factory.createTypeReferenceNode("Blob")', '"Blob"'],
    ['ts.factory.createTypeReferenceNode("A.B")', '"A.B"'],
    ["ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword)", '"string"'],
    ["ts.factory.createLiteralTypeNode(ts.factory.createTrue())", '"true"'],
    ["ts.factory.createLiteralTypeNode(ts.factory.createFalse())", '"false"'],
    [
      'ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral("a\\"b"))',
      '"\\"a\\\\\\"b\\""',
    ],
    ["ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral(0x10))", '"16"'],
    ['ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral("2"))', '"2"'],
    [
      "ts.factory.createArrayTypeNode(ts.factory.createUnionTypeNode([ts.factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword), ts.factory.createLiteralTypeNode(ts.factory.createNull())]))",
      '"(number | null)[]"',
    ],
    [
      "ts.factory.createIntersectionTypeNode([ts.factory.createUnionTypeNode([ts.factory.createTypeReferenceNode('A'), ts.factory.createTypeReferenceNode('B')]), ts.factory.createTypeReferenceNode('C')])",
      '"(A | B) & C"',
    ],
    ["ts.factory.createUnionTypeNode([ts.factory.createTypeReferenceNode('A')])", '"A"'],
    [
      "({ schema: ts.factory.createTypeReferenceNode('Date'), questionToken: true })",
      '({ schema: "Date", questionToken: true })',
    ],
    ["(ts.factory.createTypeReferenceNode('Date'))", '("Date")'],
    ["undefined", "undefined"],
  ])("rewrite turns %s into %s", (returned, expected) => {
    expect(rewrittenReturn(returned)).toBe(expected);
  });

  it.each([
    "ts.factory.createTypeReferenceNode(name)",
    'ts.factory.createTypeReferenceNode("Array", [x])',
    'ts.factory.createTypeReferenceNode("not a name")',
    "ts.factory.createKeywordTypeNode(kind)",
    "ts.factory.createKeywordTypeNode(ts.SyntaxKind.Identifier)",
    "ts.factory.createLiteralTypeNode(value)",
    "ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(text))",
    "ts.factory.createLiteralTypeNode(ts.factory.createNumericLiteral(count))",
    "ts.factory.createLiteralTypeNode(ts.factory.createRegularExpressionLiteral('/a/'))",
    "ts.factory.createUnionTypeNode([])",
    "ts.factory.createUnionTypeNode(types)",
    "ts.factory.createUnionTypeNode([unknownThing])",
    "ts.factory.createArrayTypeNode(element)",
    "ts.factory.createTypeLiteralNode([])",
    "other.factory.createTypeReferenceNode('A')",
    "ts.other.createTypeReferenceNode('A')",
    "build()",
    "({ schema: ts.factory.createTypeReferenceNode('A'), ...rest })",
    "({ questionToken: true })",
    "({ schema() { return 1; } })",
  ])("rewrite leaves a transform that returns %s", (returned) => {
    const migration = rewriter.rewrite(transformFile(returned), "gen.ts");

    expect(migration.text).toBe(transformFile(returned));
    expect(migration.manualSteps).toEqual([
      { kind: "transform-not-rewritten", line: 4, reason: "unknown-return" },
    ]);
  });

  it("rewrite understands named imports from typescript", () => {
    const header = [
      'import { factory, SyntaxKind as Kind } from "typescript";',
      'import openapiTS from "openapi-typesafe";',
    ];

    expect(rewrittenReturn("factory.createKeywordTypeNode(Kind.BooleanKeyword)", header)).toBe(
      '"boolean"',
    );
  });

  it("rewrite understands a namespace import of the TypeScript 6 package", () => {
    const header = [
      'import * as tsx from "@typescript/typescript6";',
      'import openapiTS from "openapi-typescript";',
    ];

    expect(
      rewrittenReturn(
        "tsx.factory.createTypeReferenceNode(tsx.factory.createIdentifier('Date'))",
        header,
      ),
    ).toBe('"Date"');
  });

  it("rewrite understands the helper constants and helper functions", () => {
    const header = [
      'import openapiTS, { NULL, STRING as S, tsUnion, tsIntersection, UNKNOWN } from "openapi-typesafe";',
    ];

    expect(rewrittenReturn("tsUnion([S, NULL])", header)).toBe('"string | null"');
    expect(rewrittenReturn("tsIntersection([tsUnion([S, NULL]), UNKNOWN])", header)).toBe(
      '"(string | null) & unknown"',
    );
    expect(rewrittenReturn("astToString(S)", header)).toBeUndefined();
    expect(rewrittenReturn("other([S])", header)).toBeUndefined();
  });

  it("rewrite follows module constants but not let bindings", () => {
    const header = [
      ...HEADER,
      "let LATER = ts.factory.createTypeReferenceNode('A');",
      "const ONE = 1, TWO = TWO_LATER;",
    ];

    expect(rewrittenReturn("LATER", header)).toBeUndefined();
    expect(rewrittenReturn("TWO", header)).toBeUndefined();
  });

  it("rewrite keeps a returned value of a conditional when one branch is unknown", () => {
    expect(
      rewrittenReturn("x ? ts.factory.createTypeReferenceNode('A') : build()"),
    ).toBeUndefined();
    expect(
      rewrittenReturn("x ? build() : ts.factory.createTypeReferenceNode('A')"),
    ).toBeUndefined();
    expect(rewrittenReturn("x ? void 0 : ts.factory.createTypeReferenceNode('A')")).toBe(
      'x ? void 0 : "A"',
    );
  });

  it("rewrite places irCallbacks on the same line when transform does not start a line", () => {
    const text =
      'import openapiTS, { NULL } from "openapi-typesafe";\nopenapiTS(s, { transform: () => NULL });\n';

    expect(rewriter.rewrite(text, "gen.mjs").text).toBe(
      'import openapiTS, { NULL } from "openapi-typesafe";\nopenapiTS(s, { irCallbacks: true, transform: () => "null" });\n',
    );
  });

  it("rewrite reports a transform that is not an inline function", () => {
    const text = lines(...HEADER, "openapiTS(schema, {", "  transform: myTransform,", "});");

    expect(rewriter.rewrite(text, "gen.ts").manualSteps).toEqual([
      { kind: "transform-not-rewritten", line: 4, reason: "not-a-function" },
    ]);
  });

  it("rewrite reports the other legacy callbacks and keeps transform with them", () => {
    const text = lines(
      ...HEADER,
      "openapiTS(schema, {",
      "  transform: function () { return ts.factory.createTypeReferenceNode('A'); },",
      "  postTransform: (type) => type,",
      '  "transformProperty"(property) { return property; },',
      "});",
    );

    const migration = rewriter.rewrite(text, "gen.cts");

    expect(migration.text).toBe(text);
    expect(migration.manualSteps).toEqual([
      { kind: "legacy-callback", line: 5, callback: "postTransform" },
      { kind: "legacy-callback", line: 6, callback: "transformProperty" },
      { kind: "transform-not-rewritten", line: 4, reason: "other-callbacks" },
    ]);
  });

  it("rewrite leaves options that already use irCallbacks", () => {
    const text = lines(
      ...HEADER,
      "openapiTS(schema, { irCallbacks: true, postTransform: (t) => t });",
    );

    expect(rewriter.rewrite(text, "gen.ts")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("rewrite leaves calls without callbacks, other calls and options that are not literals", () => {
    const text = lines(
      ...HEADER,
      "openapiTS(schema, { alphabetize: true });",
      "openapiTS(schema, options);",
      "openapiTS(schema);",
      "other(schema, { transform: () => ts.factory.createTypeReferenceNode('A') });",
      "api.openapiTS(schema, { transform: () => ts.factory.createTypeReferenceNode('A') });",
    );

    expect(rewriter.rewrite(text, "gen.tsx")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("rewrite leaves files that do not import the generator", () => {
    const text =
      'import openapiTS from "./local.js";\nimport "openapi-typesafe";\nimport type {} from 1;\nopenapiTS(s, { transform: () => x });\n';

    expect(rewriter.rewrite(text, "gen.jsx")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("rewrite leaves single-file components", () => {
    const text = transformFile("ts.factory.createTypeReferenceNode('A')");

    expect(rewriter.rewrite(text, "App.vue")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("rewrite follows a transform named by a module function and drops its node return type", () => {
    const header = [
      'import openapiTs, { type SchemaObject } from "openapi-typesafe";',
      'import { factory } from "typescript";',
    ];
    const text = lines(
      ...header,
      "const customTransform = (",
      "  schemaObject: SchemaObject,",
      '): import("typescript").TypeNode | undefined => {',
      '  if (schemaObject.format === "binary") {',
      '    return factory.createTypeReferenceNode("Uint8Array");',
      "  }",
      "};",
      "const ast = await openapiTs(url, {",
      "  transform: customTransform,",
      "});",
    );

    const migration = rewriter.rewrite(text, "openapi.ts");

    expect(migration.text).toBe(
      lines(
        ...header,
        "const customTransform = (",
        "  schemaObject: SchemaObject,",
        ") => {",
        '  if (schemaObject.format === "binary") {',
        '    return "Uint8Array";',
        "  }",
        "};",
        "const ast = await openapiTs(url, {",
        "  irCallbacks: true,",
        "  transform: customTransform,",
        "});",
      ),
    );
    expect(migration.changes).toEqual([{ kind: "transform-rewritten", line: 11 }]);
  });

  it("rewrite follows a function declaration and drops the return type of a method", () => {
    const text = lines(
      ...HEADER,
      "function toDate(): ts.TypeNode { return ts.factory.createTypeReferenceNode('Date'); }",
      "openapiTS(a, { transform: toDate });",
      "openapiTS(b, { transform(): ts.TypeNode { return ts.factory.createTypeReferenceNode('B'); } });",
    );

    expect(rewriter.rewrite(text, "gen.ts").text).toBe(
      lines(
        ...HEADER,
        'function toDate() { return "Date"; }',
        "openapiTS(a, { irCallbacks: true, transform: toDate });",
        'openapiTS(b, { irCallbacks: true, transform() { return "B"; } });',
      ),
    );
  });

  it("rewrite keeps a named function that is used elsewhere too", () => {
    const text = lines(
      ...HEADER,
      "const $toDate = () => ts.factory.createTypeReferenceNode('Date');",
      "openapiTS(a, { transform: $toDate });",
      "openapiTS(b, { transform: $toDate, postTransform: (t) => t });",
    );

    const migration = rewriter.rewrite(text, "gen.ts");

    expect(migration.text).toBe(text);
    expect(migration.manualSteps).toContainEqual({
      kind: "transform-not-rewritten",
      line: 4,
      reason: "shared-function",
    });
  });
});
