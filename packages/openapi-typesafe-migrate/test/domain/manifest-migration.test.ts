import { describe, expect, it } from "vitest";
import { migratePackageManifest } from "../../src/domain/manifest-migration.js";

const manifest = (value: unknown, indent: string | number = 2): string =>
  `${JSON.stringify(value, null, indent)}\n`;

describe("migratePackageManifest", () => {
  it("migratePackageManifest renames dependencies in place with the new version", () => {
    const text = manifest({
      dependencies: { a: "1", "openapi-fetch": "^0.13.1", z: "2" },
      devDependencies: { "openapi-typescript": "7.13.0" },
    });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.text).toBe(
      manifest({
        dependencies: { a: "1", "openapi-typesafe-fetch": "^1.0.0", z: "2" },
        devDependencies: { "openapi-typesafe": "1.0.0" },
      }),
    );
    expect(migrated.changes).toEqual([
      {
        kind: "dependency-renamed",
        field: "dependencies",
        from: "openapi-fetch",
        to: "openapi-typesafe-fetch",
        spec: "^1.0.0",
      },
      {
        kind: "dependency-renamed",
        field: "devDependencies",
        from: "openapi-typescript",
        to: "openapi-typesafe",
        spec: "1.0.0",
      },
    ]);
  });

  it("migratePackageManifest reports renamed peer dependencies and kept specs", () => {
    const text = manifest({ peerDependencies: { "openapi-fetch": "latest" } });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(JSON.parse(migrated.text).peerDependencies).toEqual({
      "openapi-typesafe-fetch": "latest",
    });
    expect(migrated.manualSteps).toEqual([
      { kind: "spec-kept", name: "openapi-typesafe-fetch", spec: "latest" },
      { kind: "peer-dependency-renamed", name: "openapi-typesafe-fetch" },
    ]);
  });

  it("migratePackageManifest renames the command in scripts and skips other values", () => {
    const text = manifest({ scripts: { gen: "openapi-typescript a.yaml", count: 3 } });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(JSON.parse(migrated.text).scripts).toEqual({ gen: "openapi-typesafe a.yaml", count: 3 });
    expect(migrated.changes).toEqual([{ kind: "command-renamed", location: "scripts.gen" }]);
  });

  it("migratePackageManifest reports overrides that name an original package", () => {
    const text = manifest({ overrides: { "openapi-fetch": "0.13.0" }, pnpm: { overrides: {} } });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "override-names-package", field: "overrides", name: "openapi-fetch" },
    ]);
  });

  it("migratePackageManifest reports only the package an override key targets", () => {
    const pnpm = {
      overrides: { "openapi-typescript-helpers": "0.0.15", "a>openapi-fetch@0": "1" },
    };
    const text = manifest({ pnpm, resolutions: { "**/openapi-react-query": "0.3.0" } });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.manualSteps).toEqual([
      { kind: "override-names-package", field: "resolutions", name: "openapi-react-query" },
      { kind: "override-names-package", field: "pnpm", name: "openapi-typescript-helpers" },
      { kind: "override-names-package", field: "pnpm", name: "openapi-fetch" },
    ]);
  });

  it("migratePackageManifest reports that swr-openapi still needs openapi-fetch as its peer", () => {
    const text = manifest({
      dependencies: { "openapi-fetch": "^0.13.1", "swr-openapi": "^5.6.0" },
      devDependencies: { "swr-openapi": "^5.6.0" },
    });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.manualSteps).toEqual([
      { kind: "old-peer-needed", dependent: "swr-openapi", peer: "openapi-fetch", range: ">=0.15" },
    ]);
  });

  it("migratePackageManifest does not report swr-openapi outside the dependency fields", () => {
    const text = manifest({
      dependencies: { "openapi-fetch": "^0.13.1" },
      keywords: ["swr-openapi"],
    });

    expect(migratePackageManifest(text, "1.0.0").manualSteps).toEqual([]);
  });

  it("migratePackageManifest does not take a scoped package for an original one", () => {
    const text = manifest({ resolutions: { "@acme/openapi-fetch": "1.0.0" } });

    expect(migratePackageManifest(text, "1.0.0").manualSteps).toEqual([]);
  });

  it("migratePackageManifest keeps tab indentation and a missing final newline", () => {
    const text = JSON.stringify({ dependencies: { "openapi-fetch": "1.0.0" } }, null, "\t");

    expect(migratePackageManifest(text, "2.0.0").text).toBe(
      JSON.stringify({ dependencies: { "openapi-typesafe-fetch": "2.0.0" } }, null, "\t"),
    );
  });

  it("migratePackageManifest keeps a dependency whose spec is not a string", () => {
    const text = manifest({ dependencies: { "openapi-fetch": 1 } });

    expect(migratePackageManifest(text, "1.0.0")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migratePackageManifest leaves text that is not a JSON object", () => {
    expect(migratePackageManifest("[1]", "1.0.0")).toEqual({
      text: "[1]",
      changes: [],
      manualSteps: [],
    });
  });

  it("migratePackageManifest reports a manifest that does not parse", () => {
    const migrated = migratePackageManifest("{ nope", "1.0.0");

    expect(migrated.text).toBe("{ nope");
    expect(migrated.manualSteps).toEqual([
      { kind: "manifest-unreadable", reason: expect.any(String) },
    ]);
  });
});
