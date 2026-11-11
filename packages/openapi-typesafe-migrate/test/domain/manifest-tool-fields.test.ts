import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { NO_CATALOG_PLAN } from "../../src/domain/catalog-plan.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const context = {
  version: "1.0.0",
  catalogs: NO_CATALOG_PLAN,
  manifests: [],
  aliases: [],
  rewriter: new StubCallbackRewriter(),
  scanner: new QuotedStringScanner(),
  readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
};

/** package.json as the tool migrates it, with its package names and its commands. */
function migratePackageManifest(value: unknown) {
  const migrate = fileMigrationFor("package.json");
  if (migrate === undefined) {
    throw new Error("package.json has no migration");
  }
  return migrate(`${JSON.stringify(value, null, 2)}\n`, "package.json", context);
}

describe("migratePackageManifest and the fields of other tools", () => {
  it("migratePackageManifest migrates the command of a wireit script", () => {
    const migrated = migratePackageManifest({
      scripts: { gen: "wireit" },
      wireit: { gen: { command: "openapi-typescript a.yaml -it", files: ["a.yaml"] } },
    });

    expect(JSON.parse(migrated.text)).toEqual({
      scripts: { gen: "wireit" },
      wireit: { gen: { command: "openapi-typesafe a.yaml --immutable", files: ["a.yaml"] } },
    });
    expect(migrated.changes).toContainEqual({
      kind: "command-renamed",
      location: "wireit.gen.command",
    });
  });

  it("migratePackageManifest leaves the other wireit fields that name the generator", () => {
    const wireit = {
      gen: { command: "true", description: "openapi-typescript a.yaml -it", files: ["-it"] },
    };

    expect(JSON.parse(migratePackageManifest({ wireit }).text)).toEqual({ wireit });
  });

  it("migratePackageManifest reports a typesVersions path into an old package", () => {
    const typesVersions = { "*": { client: ["node_modules/openapi-fetch/dist/index.d.ts"] } };

    const migrated = migratePackageManifest({ typesVersions });

    expect(JSON.parse(migrated.text)).toEqual({ typesVersions });
    expect(migrated.manualSteps).toEqual([
      {
        kind: "old-package-path",
        location: "typesVersions.*.client.0",
        path: "node_modules/openapi-fetch/dist/index.d.ts",
        to: "openapi-typesafe-fetch",
      },
    ]);
  });
});
