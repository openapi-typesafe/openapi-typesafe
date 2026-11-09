import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

/**
 * A library built with `declaration: true` under pnpm or Yarn PnP sees only its own dependencies:
 * `openapi-typesafe-helpers` is a dependency of this package, not of the library. Inferred types
 * that print a helper type must name it through `openapi-typesafe-fetch`, or TypeScript fails with
 * TS2742 ("cannot be named without a reference to …/openapi-typesafe-helpers"). The consumer here
 * has the packages in pnpm's layout: each in `node_modules/.pnpm/<id>/node_modules/` next to its
 * own dependencies, and only `openapi-typesafe-fetch` linked into the consumer's `node_modules`.
 * Yarn PnP names a type by the package that declares it, so the published declarations hold
 * copies of the helper types instead of importing them (ADR-034). Needs `dist` of this package
 * and of the helpers (`pnpm build`).
 */

const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));
const HELPERS_DIR = fileURLToPath(new URL("../../../openapi-typesafe-helpers", import.meta.url));
/** What a package publishes that the compiler reads. */
const PUBLISHED_PATHS = ["package.json", "dist"];
/** The published declarations: of the ES module, of the CommonJS module, and of `main`. */
const DECLARATION_FILES = ["index.d.mts", "index.d.cts", "index.d.ts"];
/**
 * The test builds and emits a whole TypeScript program. Its twin in the hooks package took 5.1 s on
 * a GitHub runner, past the default 5 s limit; 60 s leaves room for a loaded runner and still
 * stops a hung compiler.
 */
const TYPE_PROGRAM_TIMEOUT_MS = 60_000;

const CONSUMER_SOURCE = `
import createClient, { type MaybeOptionalInit } from "openapi-typesafe-fetch";

type Paths = {
  "/items": {
    get: {
      parameters: { query?: { limit?: number } };
      responses: { 200: { content: { "application/json": { id: string }[] } } };
    };
  };
};

export const client = createClient<Paths>();
export const getItems = () => client.GET("/items");
export function getGeneric<P extends "/items">(path: P, init?: MaybeOptionalInit<Paths[P], "get">) {
  return client.GET(path, init as never);
}
`;

const temporaryDirectories: string[] = [];

/** Copy what a package publishes into `directory`, as a package manager installs it. */
function install(packageDir: string, directory: string): void {
  for (const path of PUBLISHED_PATHS) {
    cpSync(join(packageDir, path), join(directory, path), { recursive: true });
  }
}

/** A consumer project with the client and its helpers installed as pnpm installs them. */
function createConsumer(): string {
  const directory = mkdtempSync(join(tmpdir(), "fetch-portable-declarations-"));
  temporaryDirectories.push(directory);
  const store = join(directory, "node_modules", ".pnpm", "openapi-typesafe-fetch", "node_modules");
  install(PACKAGE_DIR, join(store, "openapi-typesafe-fetch"));
  install(HELPERS_DIR, join(store, "openapi-typesafe-helpers"));
  symlinkSync(
    join(store, "openapi-typesafe-fetch"),
    join(directory, "node_modules", "openapi-typesafe-fetch"),
    "dir",
  );
  writeFileSync(join(directory, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(directory, "index.ts"), CONSUMER_SOURCE);
  return directory;
}

/** Emit the consumer's declarations in memory; return the diagnostics and the declaration text. */
function emitDeclarations(directory: string): { codes: number[]; declarations: string } {
  const program = ts.createProgram([join(directory, "index.ts")], {
    declaration: true,
    emitDeclarationOnly: true,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    outDir: join(directory, "out"),
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  });
  let declarations = "";
  const emitted = program.emit(undefined, (_fileName, text) => {
    declarations += text;
  });
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics];
  return { codes: diagnostics.map((diagnostic) => diagnostic.code), declarations };
}

afterAll(() => {
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("declarations of a library that uses the client", () => {
  it("name helper types through openapi-typesafe-fetch (no TS2742)", {
    timeout: TYPE_PROGRAM_TIMEOUT_MS,
  }, () => {
    const { codes, declarations } = emitDeclarations(createConsumer());

    expect(codes).toEqual([]);
    expect(declarations).toContain('import("openapi-typesafe-fetch")');
    expect(declarations).not.toContain("openapi-typesafe-helpers");
  });

  it.each(DECLARATION_FILES)("%s declares the helper types instead of importing them", (file) => {
    const declarations = readFileSync(join(PACKAGE_DIR, "dist", file), "utf8");

    expect(declarations).not.toContain("openapi-typesafe-helpers");
    expect(declarations).toMatch(/^type FilterKeys<Obj, Matchers> =/m);
    expect(declarations).toMatch(/^export type \{[^}]*\bFilterKeys\b/m);
  });
});
