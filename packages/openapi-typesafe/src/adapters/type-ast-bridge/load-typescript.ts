import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Load a TypeScript compiler module with the JavaScript API (ADR-004, decision 4). The bridge
 * needs it only for legacy `ts.Node` callbacks and the deprecated `ts.Node` helpers, so it is
 * loaded on first use, never at import time. TypeScript 7 has no JavaScript API: on such a project
 * the user installs `@typescript/typescript6`.
 */

/** The `typescript` module of TypeScript 6 or earlier (or `@typescript/typescript6`). */
export type TypeScriptModule = typeof import("typescript");

/** Loads one package by name, like `require`. */
export type ModuleRequire = (id: string) => unknown;

/** The packages to try, in order: the project's own TypeScript first. */
export const TYPESCRIPT_PACKAGES = ["typescript", "@typescript/typescript6"] as const;

/** Error codes of a package that is missing or cannot be loaded with `require`. */
const UNAVAILABLE_CODES = new Set([
  "MODULE_NOT_FOUND",
  "ERR_REQUIRE_ESM",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
]);

export class TypeScriptNotFoundError extends Error {
  constructor() {
    super(
      "A callback or helper uses TypeScript compiler nodes, which needs the TypeScript JavaScript API. " +
        'Install "typescript" version 6 or earlier, or "@typescript/typescript6" on TypeScript 7, ' +
        "or use IR callbacks (irCallbacks: true).",
    );
    this.name = "TypeScriptNotFoundError";
  }
}

/** Where to look: the current project, then this package's own location. */
export function defaultModuleRequires(): readonly ModuleRequire[] {
  return [createRequire(join(process.cwd(), "package.json")), createRequire(import.meta.url)];
}

function hasCompilerApi(value: unknown): value is TypeScriptModule {
  const module = value as Partial<TypeScriptModule> | undefined;
  return (
    typeof module?.factory?.createTypeReferenceNode === "function" &&
    typeof module.createPrinter === "function"
  );
}

function tryRequire(load: ModuleRequire, id: string): unknown {
  try {
    return load(id);
  } catch (error) {
    if (UNAVAILABLE_CODES.has((error as { code?: string }).code ?? "")) {
      return undefined;
    }
    throw error;
  }
}

/**
 * The first package with the compiler API, trying each package name with each location. Node
 * caches resolved modules, so repeated calls are cheap and return the same module.
 */
export function loadTypeScript(
  requires: readonly ModuleRequire[] = defaultModuleRequires(),
): TypeScriptModule {
  for (const id of TYPESCRIPT_PACKAGES) {
    for (const load of requires) {
      const module = tryRequire(load, id);
      if (hasCompilerApi(module)) {
        return module;
      }
    }
  }
  throw new TypeScriptNotFoundError();
}
