import ts from "typescript";

/** Compile generated declarations in memory and return the error messages (none means valid). */

const VIRTUAL_FILE = "/generated.ts";

const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts"],
};

/** The TypeScript errors of `source`, as plain messages. */
export function typeErrorsOf(source: string): string[] {
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const readFile = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (file) => file === VIRTUAL_FILE || ts.sys.fileExists(file);
  host.readFile = (file) => (file === VIRTUAL_FILE ? source : readFile(file));
  host.getSourceFile = (file, languageVersion) =>
    file === VIRTUAL_FILE
      ? ts.createSourceFile(file, source, languageVersion, true)
      : getSourceFile(file, languageVersion);
  const program = ts.createProgram([VIRTUAL_FILE], COMPILER_OPTIONS, host);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}
