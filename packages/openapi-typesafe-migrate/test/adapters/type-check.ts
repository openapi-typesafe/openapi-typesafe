import ts from "@typescript/typescript6";

/**
 * A strict type check in memory of one migrated file against declarations of the generator's
 * signatures, so tests prove that the rewritten output compiles.
 */

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

const ROOT = "/project";
const GENERATOR_DECLARATIONS = lines(
  'declare module "openapi-typesafe" {',
  "  export interface SchemaObject { format?: string }",
  "  type Base = { alphabetize?: boolean };",
  "  export interface OpenAPITSOptions extends Base {",
  "    irCallbacks?: false;",
  "    transform?: (schemaObject: SchemaObject) => object | undefined;",
  "  }",
  "  export interface OpenAPITSIrOptions extends Base {",
  "    irCallbacks: true;",
  "    transform?: (",
  "      schemaObject: SchemaObject,",
  "    ) => string | { schema: string; questionToken: boolean } | undefined;",
  "  }",
  "  export type GeneratorOptions = OpenAPITSOptions | OpenAPITSIrOptions;",
  "  function openapiTS(source: string, options?: OpenAPITSOptions): Promise<unknown>;",
  "  function openapiTS(source: string, options?: GeneratorOptions): Promise<unknown>;",
  "  export default openapiTS;",
  "}",
  'declare module "typescript" {',
  "  namespace ts {",
  "    interface TypeNode { readonly kind: number }",
  "    const factory: { createTypeReferenceNode(name: string): TypeNode };",
  "  }",
  "  export default ts;",
  "}",
);
const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  allowJs: true,
  checkJs: true,
  noLib: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};
/** The few global types that a program without the default library needs. */
const GLOBALS = lines(
  "interface Array<T> { length: number } interface Boolean {} interface Function {}",
  "interface IArguments {} interface Number {} interface Object {} interface RegExp {}",
  "interface String {} interface CallableFunction {} interface NewableFunction {}",
  "interface Promise<T> { then(f: (value: T) => void): void }",
);

/** The type errors of one file with the generator declarations, compiled in memory. */
export function typeErrors(name: string, text: string): string[] {
  const files = new Map([
    [`${ROOT}/${name}`, text],
    [`${ROOT}/generator.d.ts`, GENERATOR_DECLARATIONS],
    [`${ROOT}/globals.d.ts`, GLOBALS],
  ]);
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  host.fileExists = (file) => files.has(file);
  host.readFile = (file) => files.get(file);
  host.getSourceFile = (file, version) => {
    const content = files.get(file);
    return content === undefined ? undefined : ts.createSourceFile(file, content, version, true);
  };
  const program = ts.createProgram([...files.keys()], COMPILER_OPTIONS, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}
