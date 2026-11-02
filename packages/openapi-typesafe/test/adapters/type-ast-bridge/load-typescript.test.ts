import { createRequire } from "node:module";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  loadTypeScript,
  type ModuleRequire,
  TypeScriptNotFoundError,
} from "../../../src/adapters/type-ast-bridge/load-typescript.js";

const require = createRequire(import.meta.url);
const TYPESCRIPT6 = require("@typescript/typescript6") as typeof ts;

/** A TypeScript 7 `typescript` package: no JavaScript compiler API. */
const TYPESCRIPT7 = { version: "7.0.2" };

function missing(id: string): never {
  throw Object.assign(new Error(`Cannot find module '${id}'`), { code: "MODULE_NOT_FOUND" });
}

/** A `require` that knows only the given packages. */
function requireOf(packages: Readonly<Record<string, unknown>>): ModuleRequire {
  return (id) => (id in packages ? packages[id] : missing(id));
}

describe("loadTypeScript", () => {
  it("loads the project's typescript when it has the compiler API", () => {
    const loaded = loadTypeScript([
      requireOf({ typescript: ts, "@typescript/typescript6": TYPESCRIPT6 }),
    ]);

    expect(loaded).toBe(ts);
  });

  it("falls back to @typescript/typescript6 on a TypeScript 7 project", () => {
    const loaded = loadTypeScript([
      requireOf({ typescript: TYPESCRIPT7, "@typescript/typescript6": TYPESCRIPT6 }),
    ]);

    expect(loaded).toBe(TYPESCRIPT6);
  });

  it("tries every location for a package before the next package", () => {
    const loaded = loadTypeScript([requireOf({}), requireOf({ typescript: ts })]);

    expect(loaded).toBe(ts);
  });

  it("fails with an error that names both packages when neither is installed", () => {
    const load = () => loadTypeScript([requireOf({ typescript: TYPESCRIPT7 })]);

    expect(load).toThrow(TypeScriptNotFoundError);
    expect(load).toThrow(/"typescript" version 6 or earlier, or "@typescript\/typescript6"/);
  });

  it("treats a package that cannot be required as missing", () => {
    const esmOnly: ModuleRequire = () => {
      throw Object.assign(new Error("require() of ES Module"), { code: "ERR_REQUIRE_ESM" });
    };

    expect(() => loadTypeScript([esmOnly])).toThrow(TypeScriptNotFoundError);
  });

  it("does not hide other errors of a package", () => {
    const broken: ModuleRequire = () => {
      throw new SyntaxError("Unexpected token");
    };

    expect(() => loadTypeScript([broken])).toThrow(SyntaxError);
  });

  it("finds the installed typescript by default", () => {
    expect(typeof loadTypeScript().factory.createTypeReferenceNode).toBe("function");
  });
});
