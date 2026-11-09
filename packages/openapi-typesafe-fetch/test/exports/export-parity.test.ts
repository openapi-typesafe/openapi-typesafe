import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as runtimeModule from "../../dist/index.mjs";

/**
 * The client runtime (`src/index.js`) and its public declarations (`src/index.d.ts`) are written by hand
 * (ADR-008). These tests make any drift between the two, and any removed export, a test failure.
 */

const DECLARATIONS_PATH = new URL("../../src/index.d.ts", import.meta.url);

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

describe("public exports", () => {
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
