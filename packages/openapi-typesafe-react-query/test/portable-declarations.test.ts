// @vitest-environment node
// The test reads and writes files; jsdom gives `import.meta.url` an http scheme.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, describe, expect, it } from "vitest";

/**
 * A library built with `declaration: true` under pnpm or Yarn PnP sees only its own dependencies:
 * `openapi-typesafe-helpers` is a dependency of the hooks and the client, not of the library.
 * Inferred hook types that print a helper type must name it through a package the library has
 * (the client, a peer of the hooks), or TypeScript fails with TS2742. The consumer here has the
 * packages in pnpm's layout: each in `node_modules/.pnpm/<id>/node_modules/` next to its own
 * dependencies and peers. Needs `dist` of the hooks, the client and the helpers (`pnpm build`).
 */

const PACKAGES_DIR = fileURLToPath(new URL("../..", import.meta.url));
const TANSTACK_DIR = realpathSync(
  fileURLToPath(new URL("../node_modules/@tanstack/react-query", import.meta.url)),
);
/** What a package publishes that the compiler reads. */
const PUBLISHED_PATHS = ["package.json", "dist"];
/**
 * The test builds and emits a whole TypeScript program, with the React and TanStack Query types
 * where the hooks are checked. That took 5.1 s on a GitHub runner and 2 s locally, so the default
 * 5 s limit is too tight; 60 s leaves room for a loaded runner and still stops a hung compiler.
 */
const TYPE_PROGRAM_TIMEOUT_MS = 60_000;

const CONSUMER_SOURCE = `
import type { QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import createClient from "openapi-typesafe-react-query";

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": { id: string }[] } } } };
    post: {
      requestBody: { content: { "application/json": { id: string } } };
      responses: { 201: { content: { "application/json": { id: string } } } };
    };
  };
};

export const $api = createClient(createFetchClient<Paths>());
export const useWithClient = (queryClient: QueryClient) =>
  $api.useQuery("get", "/items", undefined, undefined, queryClient);
export const useItems = () => $api.useQuery("get", "/items");
export function useGeneric<P extends "/items">(path: P) {
  return $api.useQuery("get", path, undefined as never);
}
export function genericOptions<P extends "/items">(path: P) {
  return $api.queryOptions("get", path, undefined as never);
}
export function useGenericMutation<P extends "/items">(path: P) {
  return $api.useMutation("post", path);
}
`;

const temporaryDirectories: string[] = [];

/** Copy what a package of the workspace publishes into `directory`. */
function install(packageName: string, directory: string): void {
  for (const path of PUBLISHED_PATHS) {
    cpSync(join(PACKAGES_DIR, packageName, path), join(directory, path), { recursive: true });
  }
}

/** Link `target` at `path`, as pnpm links a dependency or a peer. */
function link(target: string, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path, "dir");
}

/** A consumer project with the hooks, the client and the helpers installed as pnpm does. */
function createConsumer(): string {
  const directory = mkdtempSync(join(tmpdir(), "react-query-portable-declarations-"));
  temporaryDirectories.push(directory);
  const modules = join(directory, "node_modules");
  const fetchStore = join(modules, ".pnpm", "openapi-typesafe-fetch", "node_modules");
  const hooksStore = join(modules, ".pnpm", "openapi-typesafe-react-query", "node_modules");
  install("openapi-typesafe-fetch", join(fetchStore, "openapi-typesafe-fetch"));
  install("openapi-typesafe-helpers", join(fetchStore, "openapi-typesafe-helpers"));
  install("openapi-typesafe-react-query", join(hooksStore, "openapi-typesafe-react-query"));
  install("openapi-typesafe-helpers", join(hooksStore, "openapi-typesafe-helpers"));
  link(join(fetchStore, "openapi-typesafe-fetch"), join(hooksStore, "openapi-typesafe-fetch"));
  link(TANSTACK_DIR, join(hooksStore, "@tanstack", "react-query"));
  link(join(fetchStore, "openapi-typesafe-fetch"), join(modules, "openapi-typesafe-fetch"));
  link(
    join(hooksStore, "openapi-typesafe-react-query"),
    join(modules, "openapi-typesafe-react-query"),
  );
  link(TANSTACK_DIR, join(modules, "@tanstack", "react-query"));
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

describe("declarations of a library that uses the hooks", () => {
  it("name helper types through a package the library has (no TS2742)", {
    timeout: TYPE_PROGRAM_TIMEOUT_MS,
  }, () => {
    const { codes, declarations } = emitDeclarations(createConsumer());

    expect(codes).toEqual([]);
    expect(declarations).toContain('import("openapi-typesafe-react-query")');
    expect(declarations).not.toContain("openapi-typesafe-helpers");
  });
});
