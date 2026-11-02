import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  printEscapedString,
  printNumberLiteral,
  printStringLiteral,
} from "../../../src/application/print/literal-text.js";
import { printNodes } from "../../../src/application/print/print-nodes.js";
import { irKeyword, irObject, irProperty } from "../../../src/domain/ir/constructors.js";
import { toPropertyName } from "../../../src/domain/ir/property-name.js";

/** ENGINEERING_PLAN 4.4: no counterexample in 10,000 runs. */
const RUNS = 10_000;

/** Any UTF-16 string, including lone surrogates and line breaks. */
const anyText = fc.string({
  unit: fc.integer({ min: 0, max: 0xffff }).map((code) => String.fromCharCode(code)),
});

function parseStringLiteral(literal: string): { text: string; diagnostics: number } {
  const source = ts.createSourceFile(
    "value.ts",
    `const value = ${literal};`,
    ts.ScriptTarget.ESNext,
  );
  const statement = source.statements[0] as ts.VariableStatement;
  const initializer = statement.declarationList.declarations[0]?.initializer as ts.StringLiteral;
  const diagnostics = (source as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics
    .length;
  return { text: initializer.text, diagnostics };
}

describe("printEscapedString", () => {
  it("printEscapedString output parses back to the same string and is ASCII only", () => {
    fc.assert(
      fc.property(anyText, (value) => {
        const literal = printEscapedString(value);

        expect(parseStringLiteral(literal)).toEqual({ text: value, diagnostics: 0 });
        // TypeScript keeps U+007F (DEL) unescaped: it is ASCII, so `escapeNonAsciiString` skips it.
        expect(/^[\x20-\x7f]*$/.test(literal)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("printEscapedString keeps DEL unescaped like the TypeScript printer", () => {
    expect(printEscapedString("\u007f")).toBe('"\u007f"');
  });

  it("printEscapedString writes a NUL before a digit as \\x00", () => {
    expect(printEscapedString("\u00001\u0000a")).toBe('"\\x001\\0a"');
  });
});

describe("printStringLiteral", () => {
  it("printStringLiteral in json encoding keeps non-ASCII characters", () => {
    expect(printStringLiteral("é", "json")).toBe('"é"');
    expect(printStringLiteral("é", "escaped")).toBe('"\\u00E9"');
  });
});

describe("printNumberLiteral", () => {
  it.each([
    [0, "0"],
    [-0, "0"],
    [-2.5, "-2.5"],
    [1e21, "1e+21"],
  ])("printNumberLiteral(%d) is %s", (value, text) => {
    expect(printNumberLiteral(value)).toBe(text);
  });
});

describe("property keys", () => {
  it("any property key prints as a key that TypeScript reads back unchanged", () => {
    fc.assert(
      fc.property(fc.oneof(anyText, fc.integer({ min: -1_000, max: 1_000_000 })), (index) => {
        const printed = printNodes([
          {
            kind: "typeAlias",
            name: "T",
            isExported: false,
            comment: null,
            type: irObject([irProperty(toPropertyName(index), irKeyword("never"))]),
          },
        ]);

        const source = ts.createSourceFile("key.ts", printed, ts.ScriptTarget.ESNext);
        const alias = source.statements[0] as ts.TypeAliasDeclaration;
        const member = (alias.type as ts.TypeLiteralNode).members[0] as ts.PropertySignature;
        expect((member.name as ts.Identifier | ts.StringLiteral | ts.NumericLiteral).text).toBe(
          String(index),
        );
      }),
      { numRuns: RUNS },
    );
  });
});
