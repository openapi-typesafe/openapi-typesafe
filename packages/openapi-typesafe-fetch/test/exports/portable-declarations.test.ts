import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

/**
 * A library built with `declaration: true` under pnpm or Yarn PnP sees only its own dependencies.
 * Inferred types that print a helper type must name a package the library depends on, or
 * TypeScript fails with TS2742 under pnpm ("cannot be named without a reference to …") and Yarn
 * PnP prints an import that the library's users cannot resolve. The client declares the helper
 * types in its `helpers` entry, so they print as `import("openapi-typesafe-fetch/helpers")`, and
 * its main entry does not export them, as openapi-fetch's does not (ADR-034). The consumer here
 * has the client in pnpm's layout: in `node_modules/.pnpm/<id>/node_modules/`, linked into the
 * consumer's `node_modules`. Needs `dist` of this package (`pnpm build`).
 */

const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));
/** What a package publishes that the compiler reads. */
const PUBLISHED_PATHS = ["package.json", "dist"];
/**
 * The published declarations of each entry, with the runtime file that their imports name: of the
 * ES module, of the CommonJS module, and of `main`.
 */
const DECLARATION_FORMATS = [
  { extension: "d.mts", runtime: "mjs" },
  { extension: "d.cts", runtime: "cjs" },
  { extension: "d.ts", runtime: "js" },
];
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

/**
 * A generic wrapper that types the client's result with names of the `helpers` entry. Both entries
 * must load one declaration of the helper types; with two, the same names are unrelated types and
 * the return fails with TS2322.
 */
const HELPERS_CONSUMER_SOURCE = `
import type { FetchResponse } from "openapi-typesafe-fetch";
import type { ErrorResponse, MediaType, Readable, ResponseObjectMap } from "openapi-typesafe-fetch/helpers";

export function failure<T extends Record<string | number, unknown>, M extends MediaType>(
  error: Readable<ErrorResponse<ResponseObjectMap<T>, M>>,
): FetchResponse<T, {}, M> {
  return { error, response: new Response() };
}
`;

/**
 * The resolutions a consumer may use. `node10` reads `main` and `typesVersions`, not `exports`; it
 * is the default of `module: commonjs` in TypeScript 5, so projects still use it. TypeScript 6
 * deprecates it (TS5107), and `ignoreDeprecations` lets this compiler check such a consumer.
 */
const RESOLUTIONS: readonly { name: string; options: ts.CompilerOptions }[] = [
  {
    name: "node10",
    options: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      ignoreDeprecations: "6.0",
    },
  },
  {
    name: "node16",
    options: { module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16 },
  },
  {
    name: "bundler",
    options: { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
  },
];

const temporaryDirectories: string[] = [];

/** Copy what a package publishes into `directory`, as a package manager installs it. */
function install(packageDir: string, directory: string): void {
  for (const path of PUBLISHED_PATHS) {
    cpSync(join(packageDir, path), join(directory, path), { recursive: true });
  }
}

/** A consumer project of `source` with the client installed as pnpm installs it. */
function createConsumer(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), "fetch-portable-declarations-"));
  temporaryDirectories.push(directory);
  const store = join(directory, "node_modules", ".pnpm", "openapi-typesafe-fetch", "node_modules");
  install(PACKAGE_DIR, join(store, "openapi-typesafe-fetch"));
  symlinkSync(
    join(store, "openapi-typesafe-fetch"),
    join(directory, "node_modules", "openapi-typesafe-fetch"),
    "dir",
  );
  writeFileSync(join(directory, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(directory, "index.ts"), source);
  return directory;
}

/** Type-check the consumer; return the diagnostic codes and the client's declaration files. */
function checkConsumer(
  directory: string,
  resolution: ts.CompilerOptions,
): { codes: number[]; clientFiles: string[] } {
  const program = ts.createProgram([join(directory, "index.ts")], {
    ...resolution,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  });
  const clientFiles = program
    .getSourceFiles()
    .map((file) => file.fileName)
    .filter((fileName) => fileName.includes("/openapi-typesafe-fetch/dist/"))
    .map((fileName) => fileName.slice(fileName.lastIndexOf("/") + 1))
    .sort();
  const codes = ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.code);
  return { codes, clientFiles };
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
  it("name helper types through openapi-typesafe-fetch/helpers (no TS2742)", {
    timeout: TYPE_PROGRAM_TIMEOUT_MS,
  }, () => {
    const { codes, declarations } = emitDeclarations(createConsumer(CONSUMER_SOURCE));

    expect(codes).toEqual([]);
    expect(declarations).toContain('import("openapi-typesafe-fetch")');
    expect(declarations).toContain('import("openapi-typesafe-fetch/helpers").FilterKeys');
    expect(declarations).not.toContain("openapi-typesafe-helpers");
    expect(declarations).not.toContain("/dist/");
  });

  it.each(DECLARATION_FORMATS)("helpers.$extension declares the helper types", (format) => {
    const declarations = readFileSync(
      join(PACKAGE_DIR, "dist", `helpers.${format.extension}`),
      "utf8",
    );

    expect(declarations).not.toContain("openapi-typesafe-helpers");
    expect(declarations).toMatch(/^type FilterKeys<Obj, Matchers> =/m);
    expect(declarations).toMatch(/^export type \{[^}]*\bFilterKeys\b/m);
  });

  it.each(DECLARATION_FORMATS)(
    "index.$extension imports the helper types and does not export them",
    (format) => {
      const declarations = readFileSync(
        join(PACKAGE_DIR, "dist", `index.${format.extension}`),
        "utf8",
      );
      const helpersImport = new RegExp(
        `^import \\{[^}]*\\bFilterKeys\\b[^}]*\\} from './helpers\\.${format.runtime}';$`,
        "m",
      );

      expect(declarations).toMatch(helpersImport);
      expect(declarations).not.toMatch(/^type FilterKeys</m);
      expect(declarations).not.toMatch(/^export (type )?\{[^}]*\bFilterKeys\b/m);
    },
  );
});

describe("a consumer that imports both entries of the client", () => {
  it.each(RESOLUTIONS)(
    "loads one declaration of the helper types under $name",
    {
      timeout: TYPE_PROGRAM_TIMEOUT_MS,
    },
    ({ options }) => {
      const { codes, clientFiles } = checkConsumer(
        createConsumer(HELPERS_CONSUMER_SOURCE),
        options,
      );

      expect(codes).toEqual([]);
      expect(clientFiles.filter((file) => file.startsWith("helpers."))).toHaveLength(1);
    },
  );
});
