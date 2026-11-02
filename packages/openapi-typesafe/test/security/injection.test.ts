import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import openapiTS, { astToString, isOpenAPITypesafeError } from "../../src/index.js";
import type { OpenAPITSOptions } from "../../src/types.js";

/**
 * ENGINEERING_PLAN 9.2 (threat model T2, docs/security/threat-model.md): text from the document
 * must never become code. Every text field gets an attack payload that tries to end the comment,
 * string, template or key it lands in and declare `MARKER`; the generated file must parse without
 * syntax errors and must not have `MARKER` as an identifier anywhere.
 */

const MARKER = "__injected__";

/** Ways out of every literal and comment the generator writes. */
const BREAKOUT = fc.constantFrom(
  "*/",
  "/*",
  "//",
  "'",
  '"',
  "`",
  "\\",
  "${",
  "}",
  "]",
  ")",
  ";",
  "\n",
  "\r",
  "\r\n",
  " ",
  " ",
  "<!--",
  "-->",
  "\u0000",
  "#",
);

/** Random text and breakouts around a statement that declares the marker. */
const PAYLOAD = fc
  .tuple(
    fc.array(fc.oneof(BREAKOUT, fc.string({ unit: "grapheme", maxLength: 4 })), { maxLength: 6 }),
    fc.array(BREAKOUT, { maxLength: 4 }),
  )
  .map(([prefix, suffix]) => `${prefix.join("")} export const ${MARKER} = 1; ${suffix.join("")}`);

/** Every option that changes how document text is written. */
const OPTION_SETS: readonly [string, OpenAPITSOptions][] = [
  ["default options", {}],
  ["enum", { enum: true }],
  ["enumValues and dedupeEnums", { enumValues: true, dedupeEnums: true }],
  ["rootTypes", { rootTypes: true }],
  ["rootTypes without the Schema prefix", { rootTypes: true, rootTypesNoSchemaPrefix: true }],
  [
    "rootTypes with kept casing and without the Schema prefix",
    { rootTypes: true, rootTypesKeepCasing: true, rootTypesNoSchemaPrefix: true },
  ],
  ["pathParamsAsTypes", { pathParamsAsTypes: true }],
  ["makePathsEnum and generatePathParams", { makePathsEnum: true, generatePathParams: true }],
  ["exportType and immutable", { exportType: true, immutable: true }],
  ["alphabetize and excludeDeprecated off", { alphabetize: true, excludeDeprecated: false }],
];

const RUNS = 40;

/** A document with the payload in every text field the generator writes out. */
function attackDocument(text: string): Record<string, unknown> {
  const textual = { title: text, description: text, default: text, example: text, format: text };
  const schema = {
    ...textual,
    type: "string",
    enum: [text, "safe"],
    "x-enum-varnames": [text, "Safe"],
    "x-enum-descriptions": [text, text],
    deprecated: true,
  };
  const object = {
    ...textual,
    type: "object",
    properties: { [text]: schema, plain: { ...textual, type: "integer", const: 1 } },
    required: [text],
  };
  const parameters = [
    { name: "id", in: "path", required: true, description: text, schema: { type: "string" } },
    { name: text, in: "query", description: text, schema },
    { name: text, in: "header", schema: { type: "string" } },
  ];
  const content = { [text]: { schema: object }, "application/json": { schema: object } };
  const response = { description: text, headers: { [text]: { description: text, schema } }, content };
  const operation = { operationId: text, summary: text, description: text, parameters };
  return {
    openapi: "3.1.0",
    info: { title: text, version: text, description: text },
    paths: { [`/items/{id}/${text}`]: { get: { ...operation, responses: { 200: response } } } },
    components: { schemas: { [text]: object, Plain: schema } },
  };
}

/**
 * The generated file, or null when the generator refused the document with ENUM_NAME_EMPTY: a
 * payload with no valid identifier characters cannot name an enum, which is a safe refusal.
 */
async function generated(document: unknown, options: OpenAPITSOptions): Promise<string | null> {
  try {
    return astToString(await openapiTS(document as never, { silent: true, ...options }));
  } catch (error) {
    if (isOpenAPITypesafeError(error) && error.code === "ENUM_NAME_EMPTY") {
      return null;
    }
    throw error;
  }
}

/** Syntax errors of the generated file and the places where the marker is an identifier. */
function inspect(output: string): { syntaxErrors: string[]; markerIdentifiers: number } {
  const file = ts.createSourceFile("generated.ts", output, ts.ScriptTarget.ES2022, true);
  const diagnostics = (file as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  let markerIdentifiers = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === MARKER) {
      markerIdentifiers++;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  const syntaxErrors = diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
  return { syntaxErrors, markerIdentifiers };
}

describe("injection through document text", () => {
  it.each(OPTION_SETS)("with %s, no text from the document becomes code", async (_, options) => {
    await fc.assert(
      fc.asyncProperty(PAYLOAD, async (text) => {
        const output = await generated(attackDocument(text), options);

        if (output !== null) {
          expect(inspect(output)).toEqual({ syntaxErrors: [], markerIdentifiers: 0 });
        }
      }),
      { numRuns: RUNS },
    );
  });
});
