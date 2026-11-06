import { describe, expect, it } from "vitest";
import { createTypescriptStringScanner } from "../../src/adapters/typescript-parser/source-strings.js";
import { migrateModuleSpecifiers } from "../../src/domain/source-migration.js";

const scanner = createTypescriptStringScanner();
const PACKAGE = "openapi-fetch";

/** Whether each `openapi-fetch` string of a file is a module specifier, in file order. */
function specifierFlags(text: string, path = "a.ts"): boolean[] {
  return scanner
    .scan(text, path)
    .filter((found) => found.value === PACKAGE)
    .map((found) => found.isModuleSpecifier);
}

describe("TypescriptSourceStringScanner", () => {
  it.each([
    ["an import", 'import createClient from "openapi-fetch";'],
    ["a side-effect import", "import 'openapi-fetch';"],
    ["a type import", 'import type { Client } from "openapi-fetch";'],
    ["an export from", 'export { default } from "openapi-fetch";'],
    ["an export all", 'export * from "openapi-fetch";'],
    ["a dynamic import", 'const client = await import("openapi-fetch");'],
    ["a template literal import", "const client = await import(`openapi-fetch`);"],
    ["require()", 'const createClient = require("openapi-fetch");'],
    ["require.resolve()", 'const path = require.resolve("openapi-fetch");'],
    ["import.meta.resolve()", 'const url = import.meta.resolve("openapi-fetch");'],
    ["import = require()", 'import createClient = require("openapi-fetch");'],
    ["an import type", 'type Client = import("openapi-fetch").Client<paths>;'],
    ["declare module", 'declare module "openapi-fetch" {}'],
    ["vi.mock()", 'vi.mock("openapi-fetch");'],
    ["vi.importActual()", 'await vi.importActual("openapi-fetch");'],
    ["jest.mock()", 'jest.mock("openapi-fetch", () => ({}));'],
    ["jest.requireActual()", 'jest.requireActual("openapi-fetch");'],
    ["a types reference", '/// <reference types="openapi-fetch" />'],
  ])("scan finds the module specifier in %s", (_position, text) => {
    expect(specifierFlags(text)).toEqual([true]);
  });

  it.each([
    ["an object key", "const versions = { 'openapi-fetch': '0.13.0' };"],
    ["an object value", 'const config = { external: ["openapi-fetch"] };'],
    ["a constant", 'export const label = "openapi-fetch";'],
    ["a second argument", 'vi.mock("other", "openapi-fetch");'],
    ["another method", 'logger.mock("openapi-fetch");'],
    ["a plain call", 'load("openapi-fetch");'],
    ["a literal type", 'type Name = "openapi-fetch";'],
    ["a JSX attribute", 'const a = <Badge name="openapi-fetch" />;'],
  ])("scan finds %s as a string that is not a module specifier", (_position, text) => {
    expect(specifierFlags(text, "a.tsx")).toEqual([false]);
  });

  it("scan skips comments, JSDoc text and a reference to a path", () => {
    const text = [
      '// "openapi-fetch" in a line comment',
      '/* "openapi-fetch" in a block comment */',
      "/** Uses `openapi-fetch` under the hood. */",
      'export function f(): void {} // import x from "openapi-fetch"',
    ].join("\n");

    expect(specifierFlags(text)).toEqual([]);
  });

  it("scan finds import types in the JSDoc of a JavaScript file once each", () => {
    const text = [
      '/** @type {import("openapi-fetch").Client<paths>} */',
      "const client = createClient();",
      "/** @param {import('openapi-fetch').FetchResponse} response */",
      "function read(response) {}",
    ].join("\n");

    expect(specifierFlags(text, "a.js")).toEqual([true, true]);
  });

  it("scan gives the offsets of the value inside the quotes", () => {
    // A reference directive counts only before the first statement.
    const text = '/// <reference types="openapi-fetch" />\nimport a from "openapi-fetch";\n';

    const found = scanner.scan(text, "a.ts").filter((string) => string.value === PACKAGE);

    expect(found.map((string) => text.slice(string.start, string.end))).toEqual([PACKAGE, PACKAGE]);
  });

  it("scan reads the script blocks of a Vue or Svelte component, not the markup", () => {
    const text = [
      '<template><p>openapi-fetch</p><Badge name="openapi-fetch" /></template>',
      '<script setup lang="ts">',
      'import createClient from "openapi-fetch";',
      "</script>",
      "<script>",
      "export const label = 'openapi-fetch';",
      "</script>",
    ].join("\n");

    const found = scanner.scan(text, "App.vue").filter((string) => string.value === PACKAGE);

    expect(found.map((string) => string.isModuleSpecifier)).toEqual([true, false]);
    expect(found.map((string) => text.slice(string.start, string.end))).toEqual([PACKAGE, PACKAGE]);
  });

  it("scan reads the frontmatter and the scripts of an Astro component", () => {
    const text = [
      "---",
      'import createClient from "openapi-fetch";',
      "---",
      '<p title="openapi-fetch">x</p>',
      '<script>import("openapi-fetch");</script>',
    ].join("\n");

    expect(specifierFlags(text, "Page.astro")).toEqual([true, true]);
  });

  it("scan finds nothing in a component without scripts", () => {
    expect(scanner.scan('<p title="openapi-fetch">x</p>', "Badge.svelte")).toEqual([]);
  });

  it("scan with migrateModuleSpecifiers renames imports only and reports the other strings", () => {
    const text = [
      "export const template = {",
      "  devDependencies: { 'openapi-typescript': '7.13.0', \"openapi-fetch\": \"0.13.0\" },",
      "};",
      'export const label = "openapi-fetch";',
      "/** Uses `openapi-fetch` under the hood. */",
      'import createClient from "openapi-fetch";',
    ].join("\n");

    const migrated = migrateModuleSpecifiers(text, scanner.scan(text, "scaffold.ts"));

    expect(migrated.text).toBe(
      text.replace('from "openapi-fetch"', 'from "openapi-typesafe-fetch"'),
    );
    expect(migrated.changes).toEqual([
      { kind: "specifier-renamed", line: 6, from: PACKAGE, to: "openapi-typesafe-fetch" },
    ]);
    expect(
      migrated.manualSteps.map((step) => step.kind === "string-names-package" && step.line),
    ).toEqual([2, 2, 4]);
  });
});
