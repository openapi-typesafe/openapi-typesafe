import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OLD_PACKAGES = [
  "openapi-fetch",
  "openapi-react-query",
  "openapi-typescript",
  "openapi-typescript-helpers",
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

function readPackage(): Record<string, Record<string, string>> {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
}

/** Old package names still named in package.json or quoted in a source file. */
function oldPackageReferences(directories: readonly string[]): string[] {
  const manifest = readPackage();
  const fromManifest = ["dependencies", "devDependencies", "scripts"].flatMap((field) =>
    Object.entries(manifest[field] ?? {}).flatMap(([name, value]) =>
      OLD_PACKAGES.filter((old) => name === old || new RegExp(`\\b${old}\\b(?!-)`).test(value)).map(
        (old) => `package.json ${field}: ${old}`,
      ),
    ),
  );
  const fromSources = directories.flatMap((directory) =>
    sourceFiles(join(ROOT, directory)).flatMap((file) =>
      OLD_PACKAGES.filter((old) => readFileSync(file, "utf8").includes(`"${old}"`)).map(
        (old) => `${file}: ${old}`,
      ),
    ),
  );
  return [...fromManifest, ...fromSources];
}

import { expect, test } from "vitest";
import { generateSchema } from "../scripts/generate-schema";

const GENERATION_TIMEOUT_MS = 30_000;

test("the script uses neither openapi-typescript nor the TypeScript compiler API", () => {
  const source = readFileSync(join(ROOT, "scripts/generate-schema.ts"), "utf8");

  expect(oldPackageReferences(["scripts"])).toEqual([]);
  expect(source).not.toMatch(/from "typescript"|ts\.factory/);
});

test("date-time strings still become Date", { timeout: GENERATION_TIMEOUT_MS }, async () => {
  const output = await generateSchema(new URL("../openapi.yaml", import.meta.url));

  expect(output).toContain("createdAt?: Date;");
  expect(output).toContain("export interface paths");
});
