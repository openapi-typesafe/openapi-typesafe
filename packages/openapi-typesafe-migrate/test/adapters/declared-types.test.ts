import { describe, expect, it } from "vitest";
import { createTypescriptCallbackRewriter } from "../../src/adapters/typescript-parser/rewriter.js";
import { typeErrors } from "./type-check.js";

/**
 * A `transform` whose type is declared outside its own signature (the type of its `const`, a
 * JSDoc `@type` or `@returns`) gets that type rewritten with the returns, so the migrated file
 * still compiles under `strict`; a type the tool cannot map keeps the `transform`.
 */

const rewriter = createTypescriptCallbackRewriter();
const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

const TS_IMPORTS = [
  'import openapiTS, { type SchemaObject } from "openapi-typesafe";',
  'import ts from "typescript";',
];
const JS_IMPORTS = ['import openapiTS from "openapi-typesafe";', 'import ts from "typescript";'];
const SCHEMA = 'import("openapi-typesafe").SchemaObject';
const DATE = 'ts.factory.createTypeReferenceNode("Date")';

/** The migrated text of a file, which must have been rewritten, and its type errors. */
function migrated(text: string, name: string) {
  const migration = rewriter.rewrite(text, name);
  expect(migration.changes).toContainEqual(
    expect.objectContaining({ kind: "transform-rewritten" }),
  );
  return { text: migration.text, errors: typeErrors(name, migration.text) };
}

describe("TypescriptCallbackRewriter and declared types", () => {
  it("rewrite maps the function type of a transform const and compiles", () => {
    const text = lines(
      ...TS_IMPORTS,
      "const transform: (s: SchemaObject) => ts.TypeNode | undefined = (s) =>",
      `  s.format === "date-time" ? ${DATE} : undefined;`,
      'await openapiTS("x", { transform });',
    );

    const result = migrated(text, "gen.ts");

    expect(result.text).toContain("const transform: (s: SchemaObject) => string | undefined =");
    expect(result.errors).toEqual([]);
  });

  it("rewrite maps a JSDoc type of a transform const in JavaScript and compiles", () => {
    const text = lines(
      ...JS_IMPORTS,
      `/** @type {(s: ${SCHEMA}) => ts.TypeNode | undefined} */`,
      `const transform = (s) => (s.format === "date-time" ? ${DATE} : undefined);`,
      'await openapiTS("x", { transform });',
    );

    const result = migrated(text, "gen.js");

    expect(result.text).toContain(`/** @type {(s: ${SCHEMA}) => string | undefined} */`);
    expect(result.errors).toEqual([]);
  });

  it("rewrite maps the JSDoc returns of an inline method in JavaScript and compiles", () => {
    const text = lines(
      ...JS_IMPORTS,
      'await openapiTS("x", {',
      "  /**",
      `   * @param {${SCHEMA}} s`,
      "   * @returns {(ts.TypeNode) | undefined}",
      "   */",
      "  transform(s) {",
      `    if (s.format === "date-time") return ${DATE};`,
      "  },",
      "});",
    );

    const result = migrated(text, "gen.js");

    expect(result.text).toContain("   * @returns {(string) | undefined}\n");
    expect(result.text).toContain("  irCallbacks: true,\n  /**\n");
    expect(result.errors).toEqual([]);
  });

  it("rewrite maps a JSDoc type of an option and an object return type", () => {
    const text = lines(
      'import openapiTS from "openapi-typesafe";',
      'import { factory } from "typescript";',
      'await openapiTS("x", {',
      `  /** @type {(s: ${SCHEMA}) => { schema: import("typescript").TypeNode; questionToken: true }} */`,
      '  transform: (s) => ({ schema: factory.createTypeReferenceNode("Date"), questionToken: true }),',
      "});",
    );

    const result = migrated(text, "gen.js");

    expect(result.text).toContain(`{(s: ${SCHEMA}) => { schema: string; questionToken: true }}`);
  });

  it("rewrite maps a JSDoc function type of a transform const", () => {
    const text = lines(
      ...JS_IMPORTS,
      `/** @type {function(${SCHEMA}): (ts.TypeNode | undefined)} */`,
      `const transform = (s) => (s.format === "date-time" ? ${DATE} : undefined);`,
      'await openapiTS("x", { transform });',
    );

    const result = migrated(text, "gen.js");

    expect(result.text).toContain(`/** @type {function(${SCHEMA}): (string | undefined)} */`);
    expect(result.errors).toEqual([]);
  });

  it("rewrite maps a named import of a node type in a declared type", () => {
    const text = lines(
      'import openapiTS from "openapi-typesafe";',
      'import { factory, type TypeNode } from "typescript";',
      'const transform: () => TypeNode & {} = () => factory.createTypeReferenceNode("Date");',
      'await openapiTS("x", { transform });',
    );

    const result = migrated(text, "gen.ts");

    expect(result.text).toContain("const transform: () => string & {} =");
  });

  it.each([
    ["a local alias", "type Make = () => ts.TypeNode;", "Make"],
    ["an array of nodes", "", "() => ts.TypeNode[]"],
    ["another type in the return", "type Node = object;", "() => Node"],
    ["a type literal with a method", "", "() => { schema(): ts.TypeNode }"],
    [
      "a node type of another namespace",
      "declare namespace N { type TypeNode = 1 }",
      "() => N.TypeNode",
    ],
  ])("rewrite keeps a transform whose declared type is %s and reports it", (_, alias, type) => {
    const text = lines(
      ...TS_IMPORTS,
      alias,
      `const transform: ${type} = () => ${DATE};`,
      'await openapiTS("x", { transform });',
    );

    const migration = rewriter.rewrite(text, "gen.ts");

    expect(migration.text).toBe(text);
    expect(migration.manualSteps).toEqual([
      { kind: "transform-not-rewritten", line: 5, reason: "declared-type" },
    ]);
  });

  it("rewrite keeps a transform whose JSDoc returns names another type", () => {
    const text = lines(
      ...JS_IMPORTS,
      'await openapiTS("x", {',
      "  /** @returns {import('openapi-typesafe').TransformObject} */",
      `  transform() { return ${DATE}; },`,
      "});",
    );

    const migration = rewriter.rewrite(text, "gen.js");

    expect(migration.manualSteps).toEqual([
      { kind: "transform-not-rewritten", line: 5, reason: "declared-type" },
    ]);
  });

  it("rewrite reads no JSDoc type in TypeScript, which the compiler ignores there", () => {
    const text = lines(
      ...TS_IMPORTS,
      "/** @type {Make} */",
      `const transform = () => ${DATE};`,
      'await openapiTS("x", { transform });',
    );

    expect(rewriter.rewrite(text, "gen.ts").manualSteps).toEqual([]);
  });

  it("rewrite accepts a const typed as any or as the options member", () => {
    const text = lines(
      'import openapiTS, { type OpenAPITSOptions } from "openapi-typesafe";',
      'import ts from "typescript";',
      `const a: any = () => ${DATE};`,
      `const b: OpenAPITSOptions["transform"] = () => ${DATE};`,
      'await openapiTS("x", { transform: a });',
      'await openapiTS("y", { transform: b });',
    );

    const migration = rewriter.rewrite(text, "gen.ts");

    expect(migration.manualSteps).toEqual([]);
    expect(migration.text).toContain('const b: OpenAPITSIrOptions["transform"] = () => "Date";');
  });
});
