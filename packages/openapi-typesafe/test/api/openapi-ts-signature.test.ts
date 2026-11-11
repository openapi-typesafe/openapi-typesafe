import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Type checks of `openapiTS` calls as a consumer writes them under `strict`, against the source:
 * the callback parameters of inline options must get their types from the options form.
 */

const CONSUMER_FILE = fileURLToPath(new URL("./signature-consumer.ts", import.meta.url));
const PACKAGE_INDEX = fileURLToPath(new URL("../../src/index.js", import.meta.url));
const TIMEOUT_MS = 30_000;

const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  types: ["node"],
};

/** The type errors of a consumer file that imports `openapiTS` and the option types. */
function consumerErrors(body: string): string[] {
  const source = [
    'import type ts from "typescript";',
    `import openapiTS, { type GeneratorOptions, type IrType } from ${JSON.stringify(PACKAGE_INDEX)};`,
    body,
  ].join("\n");
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (file) => file === CONSUMER_FILE || fileExists(file);
  host.getSourceFile = (file, languageVersion) =>
    file === CONSUMER_FILE
      ? ts.createSourceFile(file, source, languageVersion, true)
      : getSourceFile(file, languageVersion);
  const program = ts.createProgram([CONSUMER_FILE], COMPILER_OPTIONS, host);
  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(CONSUMER_FILE))
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}

describe("openapiTS signature", () => {
  it(
    "openapiTS with inline options types the callback parameters of each form",
    () => {
      const errors = consumerErrors(
        [
          "await openapiTS('x', { postTransform: (type) => { const node: ts.TypeNode = type; return node; } });",
          "await openapiTS('x', { transformProperty: (property) => { const node: ts.PropertySignature = property; return node; } });",
          "await openapiTS('x', { irCallbacks: true, postTransform: (type) => { const ir: IrType = type; return ir; } });",
          "declare const either: GeneratorOptions;",
          "await openapiTS('x', either);",
          "await openapiTS('x');",
        ].join("\n"),
      );

      expect(errors).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "openapiTS with irCallbacks true does not take a callback on TypeScript nodes",
    () => {
      const errors = consumerErrors(
        "await openapiTS('x', { irCallbacks: true, postTransform: (type: ts.TypeNode) => type });",
      );

      expect(errors).not.toEqual([]);
    },
    TIMEOUT_MS,
  );
});
