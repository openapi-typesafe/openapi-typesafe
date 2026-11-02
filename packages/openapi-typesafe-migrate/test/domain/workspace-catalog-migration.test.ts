import { describe, expect, it } from "vitest";
import { migrateWorkspaceCatalogs } from "../../src/domain/workspace-catalog-migration.js";

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
    const text = "packages:\n  - apps/*\noverrides:\n  openapi-fetch: 1.0.0\n";

    expect(migrateWorkspaceCatalogs(text, "1.0.0")).toEqual({ text, changes: [], manualSteps: [] });
  });
});
