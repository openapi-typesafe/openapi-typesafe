import { describe, expect, it } from "vitest";
import { createTypescriptCallbackRewriter } from "../../src/adapters/typescript-parser/rewriter.js";
import { typeErrors } from "./type-check.js";

/**
 * The added `irCallbacks` keeps the type `true` that the IR signature of `openapiTS` needs: the
 * migrated file is checked with `strict` against declarations of the generator's signatures.
 */

const rewriter = createTypescriptCallbackRewriter();
const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

const IMPORTS = [
  'import openapiTS, { type OpenAPITSOptions, type SchemaObject } from "openapi-typesafe";',
  'import ts from "typescript";',
];
const DATE_RETURN = 'return ts.factory.createTypeReferenceNode("Date");';

/** A file whose `transform` is in options declared as `declaration` and passed as `call`. */
function optionsFile(declaration: string, call = "await openapiTS(s, options);"): string {
  return lines(
    ...IMPORTS,
    "declare const s: string;",
    declaration,
    "  transform(schemaObject: SchemaObject) {",
    `    if (schemaObject.format === "date-time") ${DATE_RETURN}`,
    "    return undefined;",
    "  },",
    "};",
    call,
  );
}

/** The migrated text of a file, which must have been rewritten. */
function migrated(text: string, name = "gen.ts"): string {
  const migration = rewriter.rewrite(text, name);
  expect(migration.changes).toContainEqual(
    expect.objectContaining({ kind: "transform-rewritten" }),
  );
  return migration.text;
}

describe("TypescriptCallbackRewriter and the type of the added irCallbacks", () => {
  it("rewrite of options in an untyped const writes true as const and compiles", () => {
    const text = migrated(optionsFile("const options = {"));

    expect(text).toContain("  irCallbacks: true as const,\n");
    expect(typeErrors("gen.ts", text)).toEqual([]);
  });

  it("rewrite of an untyped const with a shorthand transform compiles", () => {
    const text = lines(
      ...IMPORTS,
      "declare const s: string;",
      "const transform = (schemaObject: SchemaObject) => {",
      `  if (schemaObject.format === "date-time") ${DATE_RETURN}`,
      "  return undefined;",
      "};",
      "const options = { transform, alphabetize: true };",
      "await openapiTS(s, options);",
    );

    expect(typeErrors("gen.ts", migrated(text))).toEqual([]);
  });

  it.each([
    ["an annotated const", optionsFile("const options: OpenAPITSOptions = {")],
    [
      "a const that satisfies a type",
      optionsFile("const options = {", "").replace(
        "};\n",
        "} satisfies OpenAPITSOptions;\nawait openapiTS(s, options);\n",
      ),
    ],
    ["the call", optionsFile("await openapiTS(s, {", "").replace("};\n", "});\n")],
  ])("rewrite of options typed by %s writes true and compiles", (_, file) => {
    const text = migrated(file);

    expect(text).toContain("  irCallbacks: true,\n");
    expect(typeErrors("gen.ts", text)).toEqual([]);
  });

  it("rewrite of options in an untyped const of a JavaScript file asserts const in JSDoc", () => {
    const javascript = lines(
      'import openapiTS from "openapi-typesafe";',
      'import ts from "typescript";',
      "/** @typedef {import('openapi-typesafe').SchemaObject} SchemaObject */",
      "const options = {",
      "  /** @param {SchemaObject} schemaObject */",
      "  transform(schemaObject) {",
      `    if (schemaObject.format === "date-time") ${DATE_RETURN}`,
      "    return undefined;",
      "  },",
      "};",
      'await openapiTS("x", options);',
    );

    const text = migrated(javascript, "gen.js");

    expect(text).toContain("  irCallbacks: /** @type {const} */ (true),\n");
    expect(typeErrors("gen.js", text)).toEqual([]);
  });
});
