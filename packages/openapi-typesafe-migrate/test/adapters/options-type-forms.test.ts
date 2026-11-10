import { describe, expect, it } from "vitest";
import { createTypescriptCallbackRewriter } from "../../src/adapters/typescript-parser/rewriter.js";

const rewriter = createTypescriptCallbackRewriter();
const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

const IMPORTS = 'import ts from "typescript";';
const GENERATOR = 'import openapiTS from "openapi-typesafe";';
const TRANSFORM_LINES = [
  "  transform() {",
  '    return ts.factory.createTypeReferenceNode("Date");',
  "  },",
];
const REWRITTEN_LINES = ["  irCallbacks: true,", "  transform() {", '    return "Date";', "  },"];

/** A file whose options const, declared after `before`, is the only options of the call. */
function optionsFile(before: readonly string[], declaration: string): string {
  return lines(
    IMPORTS,
    ...before,
    declaration,
    ...TRANSFORM_LINES,
    "};",
    "await openapiTS(s, options);",
  );
}

const kept = (line: number) => [{ kind: "transform-not-rewritten", line, reason: "typed-options" }];

describe("TypescriptCallbackRewriter and options typed through a type of the file", () => {
  it.each([
    ["an alias", "type Opts = OpenAPITSOptions;"],
    ["an interface", "interface Opts extends OpenAPITSOptions {}"],
    ["an alias of an alias", "type Base = OpenAPITSOptions;\ntype Opts = Base;"],
  ])("rewrite keeps a transform whose options type is %s of OpenAPITSOptions", (_, type) => {
    const imports = ['import openapiTS, { type OpenAPITSOptions } from "openapi-typesafe";', type];
    const text = optionsFile(imports, "const options: Opts = {");

    const migration = rewriter.rewrite(text, "gen.ts");

    expect(migration.text).toBe(text);
    expect(migration.manualSteps).toEqual(kept(text.split("\n").indexOf("  transform() {") + 1));
  });

  it("rewrite keeps a transform whose options type passes OpenAPITSOptions to a type", () => {
    const imports = [
      'import openapiTS, { type OpenAPITSOptions } from "openapi-typesafe";',
      "type Wrap<T> = T;",
    ];
    const text = optionsFile(imports, "const options: Wrap<OpenAPITSOptions> = {");

    expect(rewriter.rewrite(text, "gen.ts").manualSteps).toEqual(kept(5));
  });

  it("rewrite rewrites options whose own type refers to itself and not to OpenAPITSOptions", () => {
    const imports = [GENERATOR, "type Opts = { next?: Opts; transform?: unknown };"];
    const text = optionsFile(imports, "const options: Opts = {");

    // The rewrite drops the TypeScript import that no code uses any more.
    expect(rewriter.rewrite(text, "gen.ts").text).toBe(
      lines(
        ...imports,
        "const options: Opts = {",
        ...REWRITTEN_LINES,
        "};",
        "await openapiTS(s, options);",
      ),
    );
  });
});

describe("TypescriptCallbackRewriter and JSDoc options types", () => {
  it("rewrite retargets a JSDoc @type of the options const", () => {
    const type = '/** @type {import("openapi-typesafe").OpenAPITSOptions} */';
    const text = optionsFile([GENERATOR, type], "const options = {");

    expect(rewriter.rewrite(text, "gen.mjs").text).toBe(
      lines(
        GENERATOR,
        '/** @type {import("openapi-typesafe").OpenAPITSIrOptions} */',
        "const options = {",
        ...REWRITTEN_LINES,
        "};",
        "await openapiTS(s, options);",
      ),
    );
  });

  it("rewrite retargets a JSDoc @satisfies around the options", () => {
    const text = lines(
      IMPORTS,
      'import openapiTS from "openapi-typescript";',
      'await openapiTS(s, /** @satisfies {import("openapi-typescript").OpenAPITSOptions} */ ({',
      ...TRANSFORM_LINES,
      "}));",
    );

    expect(rewriter.rewrite(text, "gen.js").text).toContain(
      '/** @satisfies {import("openapi-typescript").OpenAPITSIrOptions} */ ({',
    );
  });

  it("rewrite retargets a type of a JSDoc @import and imports the IR type next to it", () => {
    const imports = [GENERATOR, '/** @import { OpenAPITSOptions } from "openapi-typesafe" */'];
    const text = optionsFile(imports, "/** @type {OpenAPITSOptions} */\nconst options = {");

    const rewritten = rewriter.rewrite(text, "gen.mjs").text;

    expect(rewritten).toContain(
      '/** @import { OpenAPITSOptions, OpenAPITSIrOptions } from "openapi-typesafe" */',
    );
    expect(rewritten).toContain("/** @type {OpenAPITSIrOptions} */");
  });

  it("rewrite keeps a transform whose options type is a JSDoc @typedef of OpenAPITSOptions", () => {
    const typedef = '/** @typedef {import("openapi-typesafe").OpenAPITSOptions} Opts */';
    const text = optionsFile([GENERATOR, typedef], "/** @type {Opts} */\nconst options = {");

    const migration = rewriter.rewrite(text, "gen.mjs");

    expect(migration.text).toBe(text);
    expect(migration.manualSteps).toEqual(kept(6));
  });

  it("rewrite reads no JSDoc type in a TypeScript file, which TypeScript does not check", () => {
    const type = '/** @type {import("openapi-typesafe").OpenAPITSOptions} */';
    const text = optionsFile([GENERATOR, type], "const options = {");

    expect(rewriter.rewrite(text, "gen.ts").text).toContain(
      `${type}\nconst options = {\n  irCallbacks: true,`,
    );
  });

  it.each([
    '/** @type {import("other").OpenAPITSOptions} */',
    '/** @type {typeof import("openapi-typesafe").OpenAPITSOptions} */',
    '/** @type {import("openapi-typesafe").OpenAPI3} */',
  ])("rewrite does not retarget the import type of %s", (type) => {
    const text = optionsFile([GENERATOR, type], "const options = {");

    expect(rewriter.rewrite(text, "a.mjs").text).toContain(type);
  });
});

describe("TypescriptCallbackRewriter and options with a spread", () => {
  it.each([
    [
      "written in the call",
      ["const base = { alphabetize: true };", "await openapiTS(s, {", "  ...base,"],
    ],
    ["in a const", ["const options = {", "  ...{ alphabetize: true },"]],
  ])("rewrite keeps a transform of options %s that spread another object", (_, before) => {
    const isCall = before.some((line) => line.startsWith("await"));
    const text = lines(
      IMPORTS,
      GENERATOR,
      ...before,
      ...TRANSFORM_LINES,
      isCall ? "});" : "};",
      ...(isCall ? [] : ["await openapiTS(s, options);"]),
    );

    const migration = rewriter.rewrite(text, "gen.ts");

    expect(migration.text).toBe(text);
    const line = text.split("\n").indexOf("  transform() {") + 1;
    expect(migration.manualSteps).toEqual([
      { kind: "transform-not-rewritten", line, reason: "spread-options" },
    ]);
  });
});
