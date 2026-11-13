// @vitest-environment node
// The test reads files; jsdom gives `import.meta.url` an http scheme.
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Types that must compile under `exactOptionalPropertyTypes`, which the package's own tsconfig does
 * not set: there an optional option that is `undefined` must say `| undefined` in its type.
 */
const WRAPPER = fileURLToPath(new URL("./exact-optional/wrapper-options.ts", import.meta.url));
/** A whole TypeScript program with React and TanStack Query types; see portable-declarations. */
const TYPE_PROGRAM_TIMEOUT_MS = 60_000;

/**
 * The diagnostics of a file, as `line: message`. Only its own: a user compiles the package's
 * declarations, not the bodies of its source, which this program also reads.
 */
function diagnosticsOf(file: string): string[] {
  const program = ts.createProgram([file], {
    exactOptionalPropertyTypes: true,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  });
  return ts.getPreEmitDiagnostics(program, program.getSourceFile(file)).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    const line = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line;
    return `${line ?? 0}: ${message}`;
  });
}

describe("exactOptionalPropertyTypes", () => {
  it("keyScope and pageParamName set to undefined compile", {
    timeout: TYPE_PROGRAM_TIMEOUT_MS,
  }, () => {
    const diagnostics = diagnosticsOf(WRAPPER);

    expect(diagnostics).toEqual([]);
  });
});
