import { describe, expect, it } from "vitest";
import { createTypescriptCallbackRewriter } from "../../src/adapters/typescript-parser/rewriter.js";

const rewriter = createTypescriptCallbackRewriter();
const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

const HEADER = [
  'import ts from "typescript";',
  'import openapiTS, { astToString } from "openapi-typesafe";',
];

describe("TypescriptCallbackRewriter and exported names", () => {
  it("rewrite keeps a constant and an import that an export list names", () => {
    const text = lines(
      ...HEADER,
      "const BLOB = ts.factory.createTypeReferenceNode('Blob');",
      "export { BLOB, ts };",
      "openapiTS(a, { transform: () => BLOB });",
    );

    const migration = rewriter.rewrite(text, "gen.ts");

    expect(migration.text).toBe(
      lines(
        ...HEADER,
        "const BLOB = ts.factory.createTypeReferenceNode('Blob');",
        "export { BLOB, ts };",
        'openapiTS(a, { irCallbacks: true, transform: () => "Blob" });',
      ),
    );
  });

  it("rewrite keeps a constant that an export list renames", () => {
    const text = lines(
      ...HEADER,
      "const BLOB = ts.factory.createTypeReferenceNode('Blob');",
      "export { BLOB as BINARY };",
      "openapiTS(a, { transform: () => BLOB });",
    );

    expect(rewriter.rewrite(text, "gen.ts").text).toContain("const BLOB =");
  });

  it("rewrite removes a constant whose name a re-export from another module only spells", () => {
    const text = lines(
      ...HEADER,
      "const BLOB = ts.factory.createTypeReferenceNode('Blob');",
      'export { BLOB } from "./types.js";',
      "openapiTS(a, { transform: () => BLOB });",
    );

    expect(rewriter.rewrite(text, "gen.ts").text).not.toContain("const BLOB =");
  });

  it.each([
    "export function toDate() { return ts.factory.createTypeReferenceNode('Date'); }",
    "export const toDate = () => ts.factory.createTypeReferenceNode('Date');",
  ])("rewrite keeps and reports an exported function that transform names: %s", (declaration) => {
    const text = lines(...HEADER, declaration, "openapiTS(a, { transform: toDate });");

    const migration = rewriter.rewrite(text, "gen.ts");

    expect(migration.text).toBe(text);
    expect(migration.manualSteps).toContainEqual({
      kind: "transform-not-rewritten",
      line: 4,
      reason: "shared-function",
    });
  });

  it("rewrite keeps and reports a function that an export list names", () => {
    const text = lines(
      ...HEADER,
      "function toDate() { return ts.factory.createTypeReferenceNode('Date'); }",
      "export { toDate };",
      "openapiTS(a, { transform: toDate });",
    );

    const migration = rewriter.rewrite(text, "gen.ts");

    expect(migration.text).toBe(text);
    expect(migration.manualSteps).toContainEqual({
      kind: "transform-not-rewritten",
      line: 5,
      reason: "shared-function",
    });
  });
});
