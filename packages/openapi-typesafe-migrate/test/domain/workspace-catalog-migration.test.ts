import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { NO_CATALOG_PLAN } from "../../src/domain/catalog-plan.js";
import {
  migrateWorkspaceCatalogs,
  PNPM_WORKSPACE_FILE,
  YARNRC_FILE,
} from "../../src/domain/workspace-catalog-migration.js";

const reader = createYamlTextReader();
const TARGET = { version: "1.0.0", catalogs: NO_CATALOG_PLAN };

const pnpm = (text: string) =>
  migrateWorkspaceCatalogs(text, reader.read(text), TARGET, PNPM_WORKSPACE_FILE);

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

    const migrated = migrateWorkspaceCatalogs(text, reader.read(text), TARGET, PNPM_WORKSPACE_FILE);

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
    const migrated = pnpm("catalog:\n  openapi-fetch: latest\n");

    expect(migrated.text).toBe("catalog:\n  openapi-typesafe-fetch: latest\n");
    expect(migrated.manualSteps).toEqual([
      { kind: "spec-kept", name: "openapi-typesafe-fetch", spec: "latest" },
    ]);
  });

  it("migrateWorkspaceCatalogs leaves a file without catalog entries unchanged", () => {
    const text = "packages:\n  - apps/*\noverrides:\n  react: 19.0.0\n";

    expect(migrateWorkspaceCatalogs(text, reader.read(text), TARGET, PNPM_WORKSPACE_FILE)).toEqual({
      text,
      changes: [],
      manualSteps: [],
    });
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

    const migrated = migrateWorkspaceCatalogs(text, reader.read(text), TARGET, PNPM_WORKSPACE_FILE);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "override-names-package", field: "overrides", name: "openapi-fetch" },
      { kind: "override-names-package", field: "overrides", name: "openapi-typescript-helpers" },
      { kind: "override-names-package", field: "patchedDependencies", name: "openapi-typescript" },
    ]);
  });

  it("migrateWorkspaceCatalogs hides URL credentials in the findings, not in the file", () => {
    const text = "catalog:\n  openapi-fetch: https://u:SECRET@npm.acme/x.tgz\n";

    const migrated = migrateWorkspaceCatalogs(text, reader.read(text), TARGET, PNPM_WORKSPACE_FILE);

    expect(migrated.text).toBe(
      "catalog:\n  openapi-typesafe-fetch: https://u:SECRET@npm.acme/x.tgz\n",
    );
    expect(migrated.manualSteps).toEqual([
      { kind: "spec-kept", name: "openapi-typesafe-fetch", spec: "https://***@npm.acme/x.tgz" },
    ]);
  });

  it("migrateWorkspaceCatalogs takes linear time on a long catalog entry with a lone CR", () => {
    const text = `catalog:\n  openapi-fetch: ${"x".repeat(LONG_LINE_LENGTH)}\ry\n`;

    const { milliseconds } = timed(() =>
      migrateWorkspaceCatalogs(text, reader.read(text), TARGET, PNPM_WORKSPACE_FILE),
    );

    expect(milliseconds).toBeLessThan(TIME_LIMIT_MS);
  });

  it("migrateWorkspaceCatalogs takes linear time on a long override line without a colon", () => {
    const half = LONG_LINE_LENGTH / 2;
    const text = `overrides:\n${" ".repeat(half)}${"a".repeat(half)}\n`;

    const { result, milliseconds } = timed(() =>
      migrateWorkspaceCatalogs(text, reader.read(text), TARGET, PNPM_WORKSPACE_FILE),
    );

    expect(result.manualSteps).toEqual([]);
    expect(milliseconds).toBeLessThan(TIME_LIMIT_MS);
  });

  it("migrateWorkspaceCatalogs reports an override key that has a colon inside", () => {
    const text = "overrides:\n  a:b>openapi-fetch: 0.13.0\n  'c:d>openapi-typescript': 7\n";

    const migrated = migrateWorkspaceCatalogs(text, reader.read(text), TARGET, PNPM_WORKSPACE_FILE);

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

    const migrated = migrateWorkspaceCatalogs(text, reader.read(text), TARGET, PNPM_WORKSPACE_FILE);

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

    const migrated = migrateWorkspaceCatalogs(text, reader.read(text), TARGET, PNPM_WORKSPACE_FILE);

    expect(migrated.text).toBe(
      "catalog:\r\n  openapi-typesafe-fetch: ^1.0.0\n  openapi-typesafe: 1.0.0\r\n",
    );
  });

  it.each([
    ['  openapi-fetch: ">=0.13.0 <0.18.0"', '  openapi-typesafe-fetch: "^1.0.0"'],
    ["  'openapi-fetch': '^7 || ^8'", "  'openapi-typesafe-fetch': '^1.0.0'"],
    ["  openapi-fetch: ^0.13.0 || ^0.17.0", "  openapi-typesafe-fetch: ^1.0.0"],
    ["  openapi-fetch: ^0.13.0 || ^0.17.0  # both", "  openapi-typesafe-fetch: ^1.0.0  # both"],
    ["  openapi-fetch: 0.x", "  openapi-typesafe-fetch: ^1.0.0"],
  ])("migrateWorkspaceCatalogs renames an entry whose range has spaces: %s", (entry, expected) => {
    expect(pnpm(`catalog:\n${entry}\n`).text).toBe(`catalog:\n${expected}\n`);
  });

  it("migrateWorkspaceCatalogs renames an entry whatever its spec, so catalog: still resolves", () => {
    const migrated = pnpm("catalog:\n  openapi-fetch: <0.18 # odd\n");

    expect(migrated.text).toBe("catalog:\n  openapi-typesafe-fetch: <0.18 # odd\n");
    expect(migrated.manualSteps).toEqual([
      { kind: "spec-kept", name: "openapi-typesafe-fetch", spec: "<0.18" },
    ]);
  });

  it("migrateWorkspaceCatalogs leaves an entry whose new name is in the catalog already", () => {
    const text = "catalog:\n  openapi-fetch: ^0.13.0\n  openapi-typesafe-fetch: ^1.0.0\n";

    const migrated = pnpm(text);

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      {
        kind: "name-collision",
        field: "catalog",
        from: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
    ]);
  });

  it("migrateWorkspaceCatalogs checks names per catalog", () => {
    const text =
      "catalog:\n  openapi-typesafe-fetch: ^1.0.0\ncatalogs:\n  old:\n    openapi-fetch: 0.13.0\n";

    expect(pnpm(text).changes).toEqual([
      {
        kind: "catalog-entry-renamed",
        catalog: "catalogs.old",
        from: "openapi-fetch",
        to: "openapi-typesafe-fetch",
        spec: "1.0.0",
      },
    ]);
  });

  it("migrateWorkspaceCatalogs edits a flow catalog and reports an anchored entry", () => {
    const text = [
      "catalog: { openapi-fetch: ^0.13.0, 'a,b': x }",
      "catalogs:",
      "  old:",
      "    openapi-typescript: &v ^7.0.0",
      "    other: *v",
      "packages:",
      "  - '{ openapi-fetch }'",
      "",
    ].join("\n");

    const migrated = pnpm(text);

    expect(migrated.text).toBe(
      text.replace("{ openapi-fetch: ^0.13.0,", "{ openapi-typesafe-fetch: ^1.0.0,"),
    );
    expect(migrated.manualSteps).toEqual([
      { kind: "entry-not-edited", field: "catalogs.old", name: "openapi-typescript" },
    ]);
  });

  it("migrateWorkspaceCatalogs quotes a new value that plain YAML would read otherwise", () => {
    const text = "catalog:\n  openapi-fetch: ^0.13.0\ncatalogs:\n  x: { openapi-typescript: 7 }\n";

    const migrated = migrateWorkspaceCatalogs(text, reader.read(text), TARGET, {
      reportedSections: new Set(),
    });

    expect(migrated.text).toBe(
      "catalog:\n  openapi-typesafe-fetch: ^1.0.0\ncatalogs:\n  x: { openapi-typesafe: ^1.0.0 }\n",
    );
  });

  it("migrateWorkspaceCatalogs reports where the file does not parse", () => {
    const text = "catalog:\n  openapi-fetch: [\n";

    expect(pnpm(text)).toEqual({
      text,
      changes: [],
      manualSteps: [{ kind: "config-unreadable", position: { line: 3, column: 1 } }],
    });
  });

  it("migrateWorkspaceCatalogs leaves a file that is not a mapping", () => {
    expect(pnpm("- a\n")).toEqual({ text: "- a\n", changes: [], manualSteps: [] });
  });

  it("migrateWorkspaceCatalogs migrates the catalogs of a Yarn .yarnrc.yml", () => {
    const text =
      "nodeLinker: node-modules\ncatalog:\n  openapi-fetch: ^0.13.0\noverrides:\n  x: 1\n";

    const migrated = migrateWorkspaceCatalogs(text, reader.read(text), TARGET, YARNRC_FILE);

    expect(migrated.text).toBe(
      "nodeLinker: node-modules\ncatalog:\n  openapi-typesafe-fetch: ^1.0.0\noverrides:\n  x: 1\n",
    );
    expect(migrated.manualSteps).toEqual([]);
  });
});
