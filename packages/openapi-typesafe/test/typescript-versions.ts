import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

/**
 * Compile generated files with `tsc --strict` of every tested TypeScript: 5.4 (the lowest
 * supported, ADR-006), 6 and 7.0. TypeScript 7 has no compiler API, so each runs its own `tsc`.
 */

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);

/** The TypeScript packages under test, by the version they stand for. */
export const TYPESCRIPT_PACKAGES = {
  "5.4": "typescript-5.4",
  "6": "typescript",
  "7.0": "typescript-7.0",
} as const;

export type TypeScriptVersion = keyof typeof TYPESCRIPT_PACKAGES;

/** Module options that every tested version accepts; TypeScript 7 removed `node10`. */
const MODULES = ["--module", "esnext", "--moduleResolution", "bundler"];

/** Enough for the cold start of one `tsc` on a slow CI runner. */
export const TSC_TIMEOUT_MS = 60_000;

function tscOf(typescriptPackage: string): string {
  const manifest = require.resolve(`${typescriptPackage}/package.json`, { paths: [PACKAGE_ROOT] });
  return path.join(path.dirname(manifest), "bin", "tsc");
}

/**
 * The `error TS` lines of `tsc --strict --noEmit` over the files (name to source) with one
 * TypeScript. The files see each other, so a check file can import a generated one.
 */
export async function strictTypeErrors(
  files: Readonly<Record<string, string>>,
  version: TypeScriptVersion,
): Promise<string[]> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openapi-typesafe-tsc-"));
  try {
    for (const [name, source] of Object.entries(files)) {
      fs.writeFileSync(path.join(directory, name), source);
    }
    const tsc = tscOf(TYPESCRIPT_PACKAGES[version]);
    const args = ["--strict", "--noEmit", "--target", "es2022", "--lib", "es2022,dom", ...MODULES];
    const result = await execa("node", [tsc, ...args, ...Object.keys(files)], {
      cwd: directory,
      reject: false,
    });
    return result.stdout.split("\n").filter((line) => line.includes("error TS"));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
