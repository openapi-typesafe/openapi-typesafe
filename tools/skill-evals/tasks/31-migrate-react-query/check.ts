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

import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { createApi } from "../src/api/react";
import { BASE_URL, createFakeFetch, json, REX } from "./kit";

test("no old package is referenced", () => {
  expect(oldPackageReferences(["src"])).toEqual([]);
});

test("package.json depends on the new packages", () => {
  const manifest = readPackage();
  expect(manifest.dependencies?.["openapi-typesafe-fetch"]).toBeDefined();
  expect(manifest.dependencies?.["openapi-typesafe-react-query"]).toBeDefined();
});

test("createApi still builds working query options", async () => {
  const $api = createApi(BASE_URL, createFakeFetch(() => json(REX)).fetch);

  const pet = await new QueryClient().fetchQuery(
    $api.queryOptions("get", "/pets/{petId}", { params: { path: { petId: 1 } } }),
  );

  expect(pet).toEqual(REX);
});
