import { describe, expect, it } from "vitest";
import { migrateWorkspaceCatalogs } from "../../src/domain/workspace-catalog-migration.js";

/** Far above the few milliseconds a linear scan takes, far below the seconds of a quadratic one. */
const TIME_LIMIT_MS = 1000;
const LONG_LINE_LENGTH = 160_000;

function timed<T>(run: () => T): { result: T; milliseconds: number } {
  const started = performance.now();
  const result = run();
  return { result, milliseconds: performance.now() - started };
}

describe("migrateWorkspaceCatalogs", () => {
  it("migrateWorkspaceCatalogs renames entries of the default and named catalogs", () => {
    const text = [
      "packages:",
      "  - openapi-fetch",
      "catalog:",
      "  openapi-fetch: ^0.13.1 # the client",
      '  "openapi-typescript": "7.13.0"',
      "  react: ^19.0.0",
      "catalogs:",
      "  legacy:",
      "    openapi-react-query: '~0.2.0'",
      "",
    ].join("\n");

    const migrated = migrateWorkspaceCatalogs(text, "1.0.0");

    expect(migrated.text).toBe(
      [
        "packages:",
        "  - openapi-fetch",
        "catalog:",
        "  openapi-typesafe-fetch: ^1.0.0 # the client",
        '  "openapi-typesafe": "1.0.0"',
        "  react: ^19.0.0",
        "catalogs:",
        "  legacy:",
        "    openapi-typesafe-react-query: '~1.0.0'",
        "",
      ].join("\n"),
    );
    expect(migrated.changes).toHaveLength(3);
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateWorkspaceCatalogs reports a spec it cannot replace", () => {
    const migrated = migrateWorkspaceCatalogs("catalog:\n  openapi-fetch: latest\n", "1.0.0");

    expect(migrated.text).toBe("catalog:\n  openapi-typesafe-fetch: latest\n");
    expect(migrated.manualSteps).toEqual([
      { kind: "spec-kept", name: "openapi-typesafe-fetch", spec: "latest" },
    ]);
  });

  it("migrateWorkspaceCatalogs leaves a file without catalog entries unchanged", () => {
    const text = "packages:\n  - apps/*\noverrides:\n  react: 19.0.0\n";

    expect(migrateWorkspaceCatalogs(text, "1.0.0")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migrateWorkspaceCatalogs reports overrides and patches that name an original package", () => {
    const text = [
      "overrides:",
      '  "app>openapi-fetch": 0.13.0',
      "  openapi-typescript-helpers: 0.0.15",
      "patchedDependencies:",
      "  openapi-typescript@7.6.1: patches/openapi-typescript.patch",
      "",
    ].join("\n");

    const migrated = migrateWorkspaceCatalogs(text, "1.0.0");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "override-names-package", field: "overrides", name: "openapi-fetch" },
      { kind: "override-names-package", field: "overrides", name: "openapi-typescript-helpers" },
      { kind: "override-names-package", field: "patchedDependencies", name: "openapi-typescript" },
    ]);
  });

  it("migrateWorkspaceCatalogs hides URL credentials in the findings, not in the file", () => {
    const text = "catalog:\n  openapi-fetch: https://u:SECRET@npm.acme/x.tgz\n";

    const migrated = migrateWorkspaceCatalogs(text, "1.0.0");

    expect(migrated.text).toBe(
      "catalog:\n  openapi-typesafe-fetch: https://u:SECRET@npm.acme/x.tgz\n",
    );
    expect(migrated.manualSteps).toEqual([
      { kind: "spec-kept", name: "openapi-typesafe-fetch", spec: "https://***@npm.acme/x.tgz" },
    ]);
  });

  it("migrateWorkspaceCatalogs takes linear time on a long catalog entry with a lone CR", () => {
    const text = `catalog:\n  openapi-fetch: ${"x".repeat(LONG_LINE_LENGTH)}\ry\n`;

    const { milliseconds } = timed(() => migrateWorkspaceCatalogs(text, "1.0.0"));

    expect(milliseconds).toBeLessThan(TIME_LIMIT_MS);
  });

  it("migrateWorkspaceCatalogs takes linear time on a long override line without a colon", () => {
    const half = LONG_LINE_LENGTH / 2;
    const text = `overrides:\n${" ".repeat(half)}${"a".repeat(half)}\n`;

    const { result, milliseconds } = timed(() => migrateWorkspaceCatalogs(text, "1.0.0"));

    expect(result.manualSteps).toEqual([]);
    expect(milliseconds).toBeLessThan(TIME_LIMIT_MS);
  });

  it("migrateWorkspaceCatalogs reports an override key that has a colon inside", () => {
    const text = "overrides:\n  a:b>openapi-fetch: 0.13.0\n  'c:d>openapi-typescript': 7\n";

    const migrated = migrateWorkspaceCatalogs(text, "1.0.0");

    expect(migrated.manualSteps).toEqual([
      { kind: "override-names-package", field: "overrides", name: "openapi-fetch" },
      { kind: "override-names-package", field: "overrides", name: "openapi-typescript" },
    ]);
  });

  it("migrateWorkspaceCatalogs migrates a file with CRLF line endings and keeps them", () => {
    const text = [
      "catalog:",
      "  openapi-fetch: ^0.17.0",
      "  'openapi-typescript': '7.13.0' # generator",
      "overrides:",
      '  "app>openapi-fetch": 0.17.0',
      "",
    ].join("\r\n");

    const migrated = migrateWorkspaceCatalogs(text, "1.0.0");

    expect(migrated.text).toBe(
      [
        "catalog:",
        "  openapi-typesafe-fetch: ^1.0.0",
        "  'openapi-typesafe': '1.0.0' # generator",
        "overrides:",
        '  "app>openapi-fetch": 0.17.0',
        "",
      ].join("\r\n"),
    );
    expect(migrated.changes).toHaveLength(2);
    expect(migrated.manualSteps).toEqual([
      { kind: "override-names-package", field: "overrides", name: "openapi-fetch" },
    ]);
  });

  it("migrateWorkspaceCatalogs keeps the ending of each line in a file with mixed endings", () => {
    const text = "catalog:\r\n  openapi-fetch: ^0.17.0\n  openapi-typescript: 7.13.0\r\n";

    const migrated = migrateWorkspaceCatalogs(text, "1.0.0");

    expect(migrated.text).toBe(
      "catalog:\r\n  openapi-typesafe-fetch: ^1.0.0\n  openapi-typesafe: 1.0.0\r\n",
    );
  });
});
