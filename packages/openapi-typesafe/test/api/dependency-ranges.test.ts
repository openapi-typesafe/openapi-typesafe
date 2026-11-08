import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The lowest version a range allows must still support what the docs promise (ADR-005, ADR-006). */

const MANIFEST = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** The first `@redocly/openapi-core` 1.x that accepts OpenAPI 3.2 documents (measured). */
const FIRST_REDOCLY_WITH_OPENAPI_3_2 = [1, 34, 15] as const;

/** The development dependency with the lowest TypeScript the declaration tests install. */
const LOWEST_TESTED_TYPESCRIPT = "typescript-5.4";

function versionParts(version: string, pattern: RegExp): number[] {
  const match = pattern.exec(version);
  if (!match) {
    throw new Error(`Expected ${pattern}, got ${version}`);
  }
  return match.slice(1).map(Number);
}

function lowestVersion(range: string): number[] {
  return versionParts(range, /^\^(\d+)\.(\d+)\.(\d+)$/);
}

function compareVersions(left: readonly number[], right: readonly number[]): number {
  const index = left.findIndex((part, position) => part !== right[position]);
  return index === -1 ? 0 : (left[index] ?? 0) - (right[index] ?? 0);
}

describe("dependency ranges", () => {
  it("the @redocly/openapi-core range starts at a version that accepts OpenAPI 3.2", () => {
    const lowest = lowestVersion(MANIFEST.dependencies["@redocly/openapi-core"] ?? "");

    expect(compareVersions(lowest, FIRST_REDOCLY_WITH_OPENAPI_3_2)).toBeGreaterThanOrEqual(0);
  });

  it("the typescript peer range starts at the lowest TypeScript that the tests install", () => {
    const peerFloor = versionParts(MANIFEST.peerDependencies.typescript ?? "", /^>=(\d+)\.(\d+)\.0$/);
    const tested = MANIFEST.devDependencies[LOWEST_TESTED_TYPESCRIPT] ?? "";

    expect(versionParts(tested, /^npm:typescript@(\d+)\.(\d+)\.\d+$/)).toEqual(peerFloor);
  });
});
