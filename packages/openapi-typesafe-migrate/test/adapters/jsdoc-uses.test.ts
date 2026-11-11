import { describe, expect, it } from "vitest";
import { createTypescriptCallbackRewriter } from "../../src/adapters/typescript-parser/rewriter.js";

/** An import that JSDoc still names is a use, so the rewrite keeps it. */

const rewriter = createTypescriptCallbackRewriter();
const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

const TS_IMPORT = 'import ts from "typescript";';

/** A file whose JSDoc block `doc` documents a function before a rewritable call. */
function fileWithDoc(doc: readonly string[]): string {
  return lines(
    'import openapiTS from "openapi-typesafe";',
    TS_IMPORT,
    ...doc,
    "export function describe(node) {",
    "  return String(node.kind);",
    "}",
    "await openapiTS(s, {",
    '  transform: () => ts.factory.createTypeReferenceNode("Date"),',
    "});",
  );
}

describe("TypescriptCallbackRewriter and imports named in JSDoc", () => {
  it.each([
    ["a JSDoc parameter type of a JavaScript file", ["/** @param {ts.TypeNode} node */"], "a.js"],
    ["a JSDoc return type", ["/**", " * @returns {ts.TypeNode}", " */"], "a.mjs"],
    ["a JSDoc link of a TypeScript file", ["/** Kept: {@link ts.factory} */"], "a.ts"],
  ])("rewrite keeps an import named in %s", (_, doc, path) => {
    const migration = rewriter.rewrite(fileWithDoc(doc), path);

    expect(migration.text).toContain(TS_IMPORT);
    expect(migration.text).toContain('transform: () => "Date"');
    expect(migration.changes).not.toContainEqual(
      expect.objectContaining({ kind: "declaration-removed" }),
    );
  });

  it("rewrite removes an import that JSDoc does not name", () => {
    const migration = rewriter.rewrite(fileWithDoc(["/** @param {unknown} node */"]), "a.js");

    expect(migration.text).not.toContain(TS_IMPORT);
  });
});
