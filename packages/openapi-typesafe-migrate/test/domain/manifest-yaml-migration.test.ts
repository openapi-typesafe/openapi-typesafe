import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const readers = { json: createJsonTextReader(), yaml: createYamlTextReader() };
const scanner = new QuotedStringScanner();
const rewriter = new StubCallbackRewriter();

/** package.yaml as the tool migrates it: package names and scripts, read by the YAML adapter. */
function migratePackageYaml(text: string, version: string) {
  const migrate = fileMigrationFor("package.yaml");
  if (migrate === undefined) {
    throw new Error("package.yaml has no migration");
  }
  return migrate(text, "package.yaml", { version, rewriter, scanner, readers });
}

describe("migratePackageManifest on package.yaml", () => {
  it("migratePackageManifest migrates a pnpm package.yaml like a package.json, in place", () => {
    const text = [
      "name: p # the package",
      "dependencies:",
      "  openapi-fetch: ^0.13.0",
      "  'swr-openapi': ^5.0.0",
      "peerDependencies:",
      '  "openapi-typescript": "7"',
      "peerDependenciesMeta:",
      "  openapi-typescript:",
      "    optional: true",
      "bundleDependencies:",
      "  - openapi-fetch",
      "scripts:",
      "  gen: openapi-typescript api.yaml -o s.ts",
      "  build: tsc",
      "  odd: [1]",
      "pnpm:",
      "  overrides:",
      "    openapi-react-query: 0.5.0",
      "",
    ].join("\n");

    const migrated = migratePackageYaml(text, "1.0.0");

    expect(migrated.text).toBe(
      text
        .replace("  openapi-fetch: ^0.13.0", "  openapi-typesafe-fetch: ^1.0.0")
        .replace('  "openapi-typescript": "7"', '  "openapi-typesafe": "^1.0.0"')
        .replace("  openapi-typescript:\n", "  openapi-typesafe:\n")
        .replace("  - openapi-fetch", "  - openapi-typesafe-fetch")
        .replace("gen: openapi-typescript api", "gen: openapi-typesafe api"),
    );
    expect(migrated.manualSteps).toEqual([
      { kind: "peer-dependency-renamed", name: "openapi-typesafe" },
      { kind: "override-names-package", field: "pnpm", name: "openapi-react-query" },
      { kind: "old-peer-needed", dependent: "swr-openapi", peer: "openapi-fetch", range: ">=0.15" },
    ]);
  });

  it("migratePackageManifest edits flow dependencies and reports an aliased one", () => {
    const text = [
      "x: &v ^7.0.0",
      "dependencies: { openapi-fetch: ^0.13.0 }",
      "devDependencies:",
      "  openapi-typescript: *v",
      "",
    ].join("\n");

    const migrated = migratePackageYaml(text, "1.0.0");

    expect(migrated.text).toBe(
      text.replace("{ openapi-fetch: ^0.13.0 }", "{ openapi-typesafe-fetch: ^1.0.0 }"),
    );
    expect(migrated.manualSteps).toEqual([
      { kind: "entry-not-edited", field: "devDependencies", name: "openapi-typescript" },
    ]);
  });

  it("migratePackageManifest writes a new value in the quoting of the old one", () => {
    const text = "dependencies:\n  'openapi-fetch': \"^0.13.0\"\n  openapi-typescript: '7'\n";

    expect(migratePackageYaml(text, "1.0.0").text).toBe(
      "dependencies:\n  'openapi-typesafe-fetch': \"^1.0.0\"\n  openapi-typesafe: '^1.0.0'\n",
    );
  });
});
