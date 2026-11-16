import { resolve } from "node:path";
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

/** Whether a compiler file name is the consumer file: TypeScript writes `/` on Windows too. */
function isConsumerFile(file: string): boolean {
  return resolve(file) === CONSUMER_FILE;
}

/** The type errors of a consumer file that imports `openapiTS` and the option types. */
function consumerErrors(body: string): string[] {
  const source = [
    'import type ts from "typescript";',
    `import openapiTS, { type GeneratorOptions, type IrDeclaration, type IrType, type OpenAPITSOptions, type SchemaSource } from ${JSON.stringify(PACKAGE_INDEX)};`,
    body,
  ].join("\n");
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (file) => isConsumerFile(file) || fileExists(file);
  host.getSourceFile = (file, languageVersion) =>
    isConsumerFile(file)
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
    "openapiTS options typed from Parameters type the inline callbacks of a wrapper",
    () => {
      const errors = consumerErrors(
        [
          "type Options = Parameters<typeof openapiTS>[1];",
          "const gen = async (options: Options) => openapiTS('x', options);",
          "await gen({ postTransform: (type) => { const node: ts.TypeNode = type; return node; } });",
          "await gen({ transformProperty: (property) => { const node: ts.PropertySignature = property; return node; } });",
        ].join("\n"),
      );

      expect(errors).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "openapiTS typed from Parameters takes the source alone and undefined options",
    () => {
      const errors = consumerErrors(
        [
          "const generate = async (...args: Parameters<typeof openapiTS>) => openapiTS(...args);",
          "await generate('x');",
          "await generate('x', { postTransform: (type) => { const node: ts.TypeNode = type; return node; } });",
          "const none: Parameters<typeof openapiTS>[1] = undefined;",
          "await openapiTS('x', none);",
        ].join("\n"),
      );

      expect(errors).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "openapiTS Parameters and ReturnType are those of openapi-typescript's signature",
    () => {
      const errors = consumerErrors(
        [
          "type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;",
          "const parameters: Same<Parameters<typeof openapiTS>, [source: SchemaSource, options?: OpenAPITSOptions]> = true;",
          "const returned: Same<ReturnType<typeof openapiTS>, Promise<IrDeclaration[]>> = true;",
          "export { parameters, returned };",
        ].join("\n"),
      );

      expect(errors).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "openapiTS options typed as GeneratorOptions type the inline callbacks of either form",
    () => {
      const errors = consumerErrors(
        [
          "const gen = async (source: SchemaSource, options: GeneratorOptions) => openapiTS(source, options);",
          "await gen('x', { postTransform: (type) => { const node: ts.TypeNode = type; return node; } });",
          "await gen('x', { irCallbacks: true, postTransform: (type) => { const ir: IrType = type; return ir; } });",
        ].join("\n"),
      );

      expect(errors).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it(
    "openapiTS with options that may be undefined accepts either form",
    () => {
      const errors = consumerErrors(
        [
          "declare const maybe: GeneratorOptions | undefined;",
          "await openapiTS('x', maybe);",
          "await openapiTS('x', undefined);",
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
