import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as runtimeModule from "../../dist/index.mjs";

/**
 * The client runtime (`src/index.js`) and its public declarations (`src/index.d.ts`) are written by hand
 * (ADR-008). These tests make any drift between the two, and any removed export, a test failure.
 */

const DECLARATIONS_PATH = new URL("../../src/index.d.ts", import.meta.url);
/** The published declarations of the main entry and of the `helpers` entry. */
const MAIN_DECLARATIONS = fileURLToPath(new URL("../../dist/index.d.mts", import.meta.url));
const HELPERS_DECLARATIONS = fileURLToPath(new URL("../../dist/helpers.d.mts", import.meta.url));

/**
 * Runtime exports that are intentionally not declared. None since `randomID` got a declaration
 * (ADR-008, amendment); the list stays so that such an export is a deliberate, commented choice.
 */
const RUNTIME_ONLY_EXPORTS: readonly string[] = [];

/** Return the names of value exports (functions, constants, default) declared in a `.d.ts` file. */
function readDeclaredValueExports(declarationsPath: URL): string[] {
  const source = ts.createSourceFile(
    "index.d.ts",
    readFileSync(declarationsPath, "utf8"),
    ts.ScriptTarget.Latest,
  );
  const names: string[] = [];
  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : [];
    const isExported = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) {
      continue;
    }
    const isDefault = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      names.push(isDefault ? "default" : statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.push(declaration.name.text);
        }
      }
    }
  }
  // The overloads of one function are one export.
  return [...new Set(names)].sort();
}

/** The names that each declaration file exports, read by the type checker. */
function readExportedNames(files: readonly string[]): string[][] {
  const program = ts.createProgram([...files], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  return files.map((file) => {
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    if (module === undefined) {
      throw new Error(`no module for ${file}`);
    }
    return checker.getExportsOfModule(module).map((symbol) => symbol.name);
  });
}

/** The names of the type aliases and interfaces at the top level of a declaration file. */
function readTopLevelTypeNames(declarationsPath: URL): string[] {
  const text = readFileSync(declarationsPath, "utf8");
  const source = ts.createSourceFile("index.d.ts", text, ts.ScriptTarget.Latest);
  return source.statements
    .filter(
      (statement) => ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement),
    )
    .map((statement) => statement.name.text);
}

describe("public exports", () => {
  it("the main entry exports none of the helper types, as openapi-fetch's does not", () => {
    const [main, helpers] = readExportedNames([MAIN_DECLARATIONS, HELPERS_DECLARATIONS]);

    const shared = (main ?? []).filter((name) => helpers?.includes(name));

    expect(helpers).toContain("FilterKeys");
    expect(shared).toEqual([]);
  });

  // openapi-fetch's src/index.d.ts has no export list, so a declaration file exports all of its
  // top-level types, and projects import unexported ones such as `InitParam` from
  // `openapi-fetch/src/index.js`. An `export { … }` or `export *` here would end that.
  it("src/index.d.ts exports every top-level type, as openapi-fetch's does", () => {
    const [exported] = readExportedNames([fileURLToPath(DECLARATIONS_PATH)]);

    const missing = readTopLevelTypeNames(DECLARATIONS_PATH).filter(
      (name) => !exported?.includes(name),
    );

    expect(exported).toContain("InitParam");
    expect(missing).toEqual([]);
  });

  it("runtime exports match declared value exports except the runtime-only allow-list", () => {
    const declared = readDeclaredValueExports(DECLARATIONS_PATH);

    const runtime = Object.keys(runtimeModule)
      .filter((name) => !RUNTIME_ONLY_EXPORTS.includes(name))
      .sort();

    expect(runtime).toEqual(declared);
  });

  it("runtime-only allow-list names exports that still exist at runtime", () => {
    const runtime = Object.keys(runtimeModule);

    const missing = RUNTIME_ONLY_EXPORTS.filter((name) => !runtime.includes(name));

    expect(missing).toEqual([]);
  });

  it("public export list is unchanged", () => {
    const runtime = Object.keys(runtimeModule).sort();

    expect(runtime).toMatchInlineSnapshot(`
      [
        "createFinalURL",
        "createPathBasedClient",
        "createQuerySerializer",
        "default",
        "defaultBodySerializer",
        "defaultPathSerializer",
        "mergeHeaders",
        "randomID",
        "removeTrailingSlash",
        "serializeArrayParam",
        "serializeObjectParam",
        "serializePrimitiveParam",
        "wrapAsPathBasedClient",
      ]
    `);
  });
});
