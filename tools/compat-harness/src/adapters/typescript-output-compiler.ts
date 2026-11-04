import { existsSync } from "node:fs";
import ts from "typescript";
import type { OutputCompiler } from "../application/ports.ts";
import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";
import { runChecker } from "./checker-limit.ts";

/** A strict project with no ambient types, so only the generated file itself is checked. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  types: [],
};

/** OutputCompiler over the TypeScript compiler API. */
export class TypeScriptOutputCompiler implements OutputCompiler {
  async countErrors(path: string): Promise<number> {
    if (!existsSync(path)) {
      throw new HarnessError(
        HarnessErrorCode.StoredFileInvalid,
        `Generated file is missing: ${path}`,
      );
    }
    return runChecker(path, () => {
      const program = ts.createProgram([path], COMPILER_OPTIONS);
      return ts.getPreEmitDiagnostics(program).length;
    });
  }
}
