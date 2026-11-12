import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Types that must compile under `exactOptionalPropertyTypes`, which the package's own tsconfig does
 * not set: there an optional property that is `undefined` must say `| undefined` in its type.
 */

const QUERY_OPTIONS_SOURCE = fileURLToPath(new URL("./query-options.ts", import.meta.url));

/**
 * The test builds a whole TypeScript program; a loaded runner takes a few seconds. 60 s leaves room
 * for that and still stops a hung compiler.
 */
const TYPE_PROGRAM_TIMEOUT_MS = 60_000;

const EXACT_OPTIONAL_OPTIONS: ts.CompilerOptions = {
  strict: true,
  exactOptionalPropertyTypes: true,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
  types: [],
};

function diagnosticsOf(fileName: string): string[] {
  const program = ts.createProgram([fileName], EXACT_OPTIONAL_OPTIONS);
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
}

describe("exactOptionalPropertyTypes", () => {
  it("QuerySerializerOptions with undefined options compiles", {
    timeout: TYPE_PROGRAM_TIMEOUT_MS,
  }, () => {
    const diagnostics = diagnosticsOf(QUERY_OPTIONS_SOURCE);

    expect(diagnostics).toEqual([]);
  });
});
