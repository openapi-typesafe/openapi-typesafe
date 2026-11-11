import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { NO_CATALOG_PLAN } from "../../src/domain/catalog-plan.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const readers = { json: createJsonTextReader(), yaml: createYamlTextReader() };
const scanner = new QuotedStringScanner();
const rewriter = new StubCallbackRewriter();

/**
 * package.json as the tool migrates it: the package names (domain/manifest-migration.ts) and the
 * scripts (domain/json-command-migration.ts), read by the JSON adapter.
 */
function migratePackageManifest(text: string, version: string) {
  const migrate = fileMigrationFor("package.json");
  if (migrate === undefined) {
    throw new Error("package.json has no migration");
  }
  return migrate(text, "package.json", {
    version,
    catalogs: NO_CATALOG_PLAN,
    manifests: [],
    aliases: [],
    apiDescriptionParts: new Set<string>(),
    rewriter,
    scanner,
    readers,
  });
}

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
      {
        kind: "override-names-package",
        field: "pnpm.overrides",
        name: "openapi-typescript-helpers",
      },
      { kind: "override-names-package", field: "pnpm.overrides", name: "openapi-fetch" },
    ]);
  });

  it("migratePackageManifest reports the pnpm settings and override values that name one", () => {
    const pnpm = {
      packageExtensions: { "openapi-fetch@*": { dependencies: { x: "1" } } },
      onlyBuiltDependencies: ["openapi-typescript"],
      peerDependencyRules: { ignoreMissing: ["left-pad"] },
    };
    const overrides = { x: "npm:openapi-react-query@0.3.0" };
    const text = manifest({ pnpm, overrides });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "override-names-package", field: "overrides", name: "openapi-react-query" },
      { kind: "setting-names-package", field: "pnpm.packageExtensions", name: "openapi-fetch" },
      {
        kind: "setting-names-package",
        field: "pnpm.onlyBuiltDependencies",
        name: "openapi-typescript",
      },
    ]);
  });

  it("migratePackageManifest reports the Jest patterns of the jest field", () => {
    const text = manifest({ jest: { moduleNameMapper: { "^openapi-fetch$": "<rootDir>/m.ts" } } });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.manualSteps).toEqual([
      {
        kind: "pattern-names-package",
        location: "jest.moduleNameMapper",
        value: "^openapi-fetch$",
        name: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
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

  it("migratePackageManifest keeps and reports a dependency whose spec is not a string", () => {
    const text = manifest({ dependencies: { "openapi-fetch": 1 } });

    expect(migratePackageManifest(text, "1.0.0")).toEqual({
      text,
      changes: [],
      manualSteps: [{ kind: "entry-not-edited", field: "dependencies", name: "openapi-fetch" }],
    });
  });

  it("migratePackageManifest reports a manifest that is not a JSON object and leaves it", () => {
    expect(migratePackageManifest('["openapi-fetch"]', "1.0.0")).toEqual({
      text: '["openapi-fetch"]',
      changes: [],
      manualSteps: [{ kind: "config-unreadable", position: { line: 1, column: 1 } }],
    });
  });

  it("migratePackageManifest leaves a broken manifest that names no original package", () => {
    expect(migratePackageManifest("{ nope", "1.0.0").manualSteps).toEqual([]);
  });

  it("migratePackageManifest leaves an empty manifest", () => {
    expect(migratePackageManifest("", "1.0.0")).toEqual({ text: "", changes: [], manualSteps: [] });
  });

  it("migratePackageManifest reports where a manifest does not parse", () => {
    const text = '{\n  "openapi-fetch": nope\n}';

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "config-unreadable", position: { line: 2, column: 20 } },
    ]);
  });

  it("migratePackageManifest reports a parse error by position, without the file's text", () => {
    const migrated = migratePackageManifest('{"openapi-fetch": https://SECRET@h.io}', "1.0.0");

    expect(migrated.manualSteps).toEqual([
      { kind: "config-unreadable", position: { line: 1, column: 24 } },
    ]);
  });

  it("migratePackageManifest hides URL credentials in the findings, not in the file", () => {
    const spec = "git+https://ghp_SECRET@github.com/acme/openapi-fetch.git";
    const text = manifest({ dependencies: { "openapi-fetch": spec } });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.text).toBe(manifest({ dependencies: { "openapi-typesafe-fetch": spec } }));
    const hidden = "git+https://***@github.com/acme/openapi-fetch.git";
    expect(migrated.changes).toEqual([expect.objectContaining({ spec: hidden })]);
    expect(migrated.manualSteps).toEqual([
      { kind: "spec-kept", name: "openapi-typesafe-fetch", spec: hidden },
    ]);
  });

  it("migratePackageManifest keeps CRLF line endings", () => {
    const text = manifest({ devDependencies: { "openapi-typescript": "^7.13.0" } }).replaceAll(
      "\n",
      "\r\n",
    );

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.text).toBe(
      manifest({ devDependencies: { "openapi-typesafe": "^1.0.0" } }).replaceAll("\n", "\r\n"),
    );
  });

  it("migratePackageManifest changes only the renamed names and specs, byte for byte", () => {
    const text = [
      "{",
      '  "description": "café \\/ slash",',
      '  "config": { "big": 12345678901234567890, "f": 1.0, "2": "two", "1": "one" },',
      '  "files": ["dist", "src"],',
      '  "scripts": { "a": "x" },',
      '  "scripts": { "gen": "openapi-typescript api.yaml" },',
      '  "dependencies": {',
      '    "openapi-fetch": "^0.13.0"',
      "  }",
      "}",
      "",
    ].join("\n");

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.text).toBe(
      text
        .replace("openapi-typescript api.yaml", "openapi-typesafe api.yaml")
        .replace('"openapi-fetch": "^0.13.0"', '"openapi-typesafe-fetch": "^1.0.0"'),
    );
  });

  it("migratePackageManifest renames in every copy of a duplicated field", () => {
    const text =
      '{"dependencies": {"openapi-fetch": "1.0.0"}, "dependencies": {"openapi-fetch": "2"}}';

    expect(migratePackageManifest(text, "1.0.0").text).toBe(
      '{"dependencies": {"openapi-typesafe-fetch": "1.0.0"}, ' +
        '"dependencies": {"openapi-typesafe-fetch": "^1.0.0"}}',
    );
  });

  it("migratePackageManifest migrates a manifest with a byte order mark and keeps the mark", () => {
    const text = `﻿${manifest({ dependencies: { "openapi-fetch": "^0.13.0" } })}`;

    expect(migratePackageManifest(text, "1.0.0").text).toBe(
      `﻿${manifest({ dependencies: { "openapi-typesafe-fetch": "^1.0.0" } })}`,
    );
  });

  it("migratePackageManifest renames the keys of the meta fields and the bundled names", () => {
    const text = manifest({
      peerDependencies: { "openapi-fetch": "0.x" },
      peerDependenciesMeta: { "openapi-fetch": { optional: true } },
      dependenciesMeta: { "openapi-typescript": { injected: true } },
      bundleDependencies: ["openapi-fetch", 1, "other"],
      bundledDependencies: ["openapi-react-query"],
    });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(JSON.parse(migrated.text)).toEqual({
      peerDependencies: { "openapi-typesafe-fetch": "^1.0.0" },
      peerDependenciesMeta: { "openapi-typesafe-fetch": { optional: true } },
      dependenciesMeta: { "openapi-typesafe": { injected: true } },
      bundleDependencies: ["openapi-typesafe-fetch", 1, "other"],
      bundledDependencies: ["openapi-typesafe-react-query"],
    });
    expect(migrated.changes).toContainEqual({
      kind: "package-name-renamed",
      location: "peerDependenciesMeta",
      from: "openapi-fetch",
      to: "openapi-typesafe-fetch",
    });
  });

  it("migratePackageManifest reports a meta key with a version instead of renaming it", () => {
    const text = manifest({ dependenciesMeta: { "openapi-fetch@0.13.0": { built: false } } });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "override-names-package", field: "dependenciesMeta", name: "openapi-fetch" },
    ]);
  });

  it("migratePackageManifest leaves an entry whose new name is in the field already", () => {
    const text = manifest({
      dependencies: { "openapi-typesafe-fetch": "workspace:*", "openapi-fetch": "catalog:" },
      bundleDependencies: ["openapi-fetch", "openapi-typesafe-fetch"],
    });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.text).toBe(text);
    expect(migrated.changes).toEqual([]);
    const collision = {
      kind: "name-collision",
      from: "openapi-fetch",
      to: "openapi-typesafe-fetch",
    };
    expect(migrated.manualSteps).toEqual([
      { ...collision, field: "dependencies" },
      { ...collision, field: "bundleDependencies" },
    ]);
  });

  it("migratePackageManifest migrates bun catalogs at the top level and under workspaces", () => {
    const text = manifest({
      workspaces: {
        packages: ["packages/*"],
        catalog: { "openapi-fetch": "^0.13.0" },
        catalogs: { old: { "openapi-typescript": "7.13.0" } },
      },
      catalog: { "openapi-react-query": "~0.5.0" },
      catalogs: { legacy: { "openapi-typescript-helpers": "0.0.15" }, odd: "x" },
    });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(JSON.parse(migrated.text)).toEqual({
      workspaces: {
        packages: ["packages/*"],
        catalog: { "openapi-typesafe-fetch": "^1.0.0" },
        catalogs: { old: { "openapi-typesafe": "1.0.0" } },
      },
      catalog: { "openapi-typesafe-react-query": "~1.0.0" },
      catalogs: { legacy: { "openapi-typesafe-helpers": "1.0.0" }, odd: "x" },
    });
    expect(
      migrated.changes.map((change) => change.kind === "catalog-entry-renamed" && change.catalog),
    ).toEqual(["catalog", "catalogs.legacy", "workspaces.catalog", "workspaces.catalogs.old"]);
  });

  it("migratePackageManifest retargets an npm alias of an original package", () => {
    const text = manifest({
      dependencies: {
        "my-fetch": "npm:openapi-fetch@^0.13.0",
        "openapi-fetch": "npm:openapi-fetch@0.13.1",
        other: "npm:left-pad@1",
      },
    });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(JSON.parse(migrated.text).dependencies).toEqual({
      "my-fetch": "npm:openapi-typesafe-fetch@^1.0.0",
      "openapi-typesafe-fetch": "npm:openapi-typesafe-fetch@1.0.0",
      other: "npm:left-pad@1",
    });
    expect(migrated.changes[0]).toEqual({
      kind: "alias-renamed",
      field: "dependencies",
      name: "my-fetch",
      spec: "npm:openapi-typesafe-fetch@^1.0.0",
    });
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migratePackageManifest reports an npm alias whose tag it keeps", () => {
    const text = manifest({ dependencies: { "my-fetch": "npm:openapi-fetch@latest" } });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(JSON.parse(migrated.text).dependencies).toEqual({
      "my-fetch": "npm:openapi-typesafe-fetch@latest",
    });
    expect(migrated.manualSteps).toEqual([
      { kind: "spec-kept", name: "my-fetch", spec: "npm:openapi-typesafe-fetch@latest" },
    ]);
  });

  it("migratePackageManifest renames the subpath import targets of an original package", () => {
    const text = manifest({
      imports: {
        "#client": "openapi-fetch",
        "#schema": { node: ["openapi-typescript-helpers/sub", "./local.js"], default: null },
        "#other": "left-pad",
      },
    });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(JSON.parse(migrated.text).imports).toEqual({
      "#client": "openapi-typesafe-fetch",
      "#schema": { node: ["openapi-typesafe-helpers/sub", "./local.js"], default: null },
      "#other": "left-pad",
    });
    expect(migrated.changes).toEqual([
      {
        kind: "package-name-renamed",
        location: "imports.#client",
        from: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
      {
        kind: "package-name-renamed",
        location: "imports.#schema.node.0",
        from: "openapi-typescript-helpers/sub",
        to: "openapi-typesafe-helpers/sub",
      },
    ]);
    expect(migrated.manualSteps).toEqual([
      {
        kind: "deep-target",
        location: "imports.#schema.node.0",
        specifier: "openapi-typesafe-helpers/sub",
      },
    ]);
  });

  it("migratePackageManifest renames the specifiers of an original package in browser", () => {
    const text = manifest({
      browser: {
        "openapi-fetch": false,
        "openapi-typescript-helpers/x.js": "./shim.js",
        "./server.js": "openapi-react-query",
        "left-pad": false,
      },
    });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(JSON.parse(migrated.text).browser).toEqual({
      "openapi-typesafe-fetch": false,
      "openapi-typesafe-helpers/x.js": "./shim.js",
      "./server.js": "openapi-typesafe-react-query",
      "left-pad": false,
    });
    expect(migrated.manualSteps).toEqual([
      {
        kind: "deep-target",
        location: "browser.openapi-typescript-helpers/x.js",
        specifier: "openapi-typesafe-helpers/x.js",
      },
    ]);
  });

  it("migratePackageManifest keeps a browser key whose new name is there too", () => {
    const text = manifest({ browser: { "openapi-fetch": false, "openapi-typesafe-fetch": false } });

    const migrated = migratePackageManifest(text, "1.0.0");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      {
        kind: "name-collision",
        field: "browser",
        from: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
    ]);
  });

  it("migratePackageManifest keeps a browser string, the package's own file", () => {
    const text = manifest({ browser: "./dist/browser.js", dependencies: {} });

    expect(migratePackageManifest(text, "1.0.0").text).toBe(text);
  });
});
