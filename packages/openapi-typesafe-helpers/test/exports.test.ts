import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** The module that names the helper types, and the client's module that declares them. */
const HELPERS_ENTRY = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const DECLARATIONS = fileURLToPath(
  new URL("../../openapi-typesafe-fetch/src/helpers.ts", import.meta.url),
);

/** The names that each file exports, read by the type checker. */
function exportedNames(files: readonly string[]): string[][] {
  const program = ts.createProgram([...files], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  return files.map((file) => {
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    if (module === undefined) {
      throw new Error(`no module for ${file}`);
    }
    return checker
      .getExportsOfModule(module)
      .map((symbol) => symbol.name)
      .sort();
  });
}

describe("openapi-typesafe-helpers", () => {
  it("exports every helper type that openapi-typesafe-fetch declares, and nothing else", () => {
    const [named, declared] = exportedNames([HELPERS_ENTRY, DECLARATIONS]);

    expect(named).toEqual(declared);
  });
});
