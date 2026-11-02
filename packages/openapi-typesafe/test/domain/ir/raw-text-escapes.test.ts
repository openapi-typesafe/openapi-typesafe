import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  escapeSingleQuotedText,
  escapeTemplateText,
} from "../../../src/domain/ir/raw-text-escapes.js";

/** Characters that end or change a literal, mixed into random text. */
const SPECIAL = fc.constantFrom("\\", "'", '"', "`", "${", "}", "\n", "\r", " ", " ", "$");
const TEXT = fc
  .array(fc.oneof(SPECIAL, fc.string({ unit: "grapheme" })), { maxLength: 12 })
  .map((parts) => parts.join(""));

/** The only expression of `type T = <literal>;`, as TypeScript parses it. */
function parsedLiteral(literal: string): ts.Node | undefined {
  const file = ts.createSourceFile("t.ts", `type T = ${literal};`, ts.ScriptTarget.ES2022, true);
  const diagnostics = (file as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [];
  const statement = file.statements[0];
  if (diagnostics.length > 0 || file.statements.length !== 1 || statement === undefined) {
    return undefined;
  }
  const type = (statement as ts.TypeAliasDeclaration).type;
  return ts.isLiteralTypeNode(type) ? type.literal : type;
}

describe("escapeSingleQuotedText", () => {
  it("escapeSingleQuotedText reads back as the same value for any text", () => {
    fc.assert(
      fc.property(TEXT, (value) => {
        const literal = parsedLiteral(`'${escapeSingleQuotedText(value)}'`);

        expect(literal !== undefined && ts.isStringLiteral(literal) && literal.text).toBe(value);
      }),
    );
  });

  it("escapeSingleQuotedText leaves text without special characters unchanged", () => {
    const plain = `Pet "name" $\{x} \`y\` 名前`;

    expect(escapeSingleQuotedText(plain)).toBe(plain);
  });
});

describe("escapeTemplateText", () => {
  it("escapeTemplateText reads back as the same value with no placeholder for any text", () => {
    fc.assert(
      fc.property(TEXT, (value) => {
        const literal = parsedLiteral(`\`${escapeTemplateText(value)}\``);

        expect(
          literal !== undefined && ts.isNoSubstitutionTemplateLiteral(literal) && literal.text,
        ).toBe(value);
      }),
    );
  });

  it("escapeTemplateText leaves a single $ and braces alone", () => {
    expect(escapeTemplateText("/a/$b/{c}")).toBe("/a/$b/{c}");
  });
});
