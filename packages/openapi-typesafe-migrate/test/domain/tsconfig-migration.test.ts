import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { NO_CATALOG_PLAN } from "../../src/domain/catalog-plan.js";
import { migrateTsconfig } from "../../src/domain/tsconfig-migration.js";
import { QuotedStringScanner } from "../fakes/quoted-string-scanner.js";
import { StubCallbackRewriter } from "../fakes/stub-callback-rewriter.js";

const context = {
  version: "1.0.0",
  catalogs: NO_CATALOG_PLAN,
  manifests: [],
  aliases: [],
  apiDescriptionParts: new Set<string>(),
  rewriter: new StubCallbackRewriter(),
  scanner: new QuotedStringScanner(),
  readers: { json: createJsonTextReader(), yaml: createYamlTextReader() },
};

/** A project config as the tool migrates it, read by the JSON adapter. */
function migrateConfig(text: string, path = "tsconfig.json") {
  const migrate = fileMigrationFor(path);
  if (migrate === undefined) {
    throw new Error(`${path} has no migration`);
  }
  return migrate(text, path, context);
}

const config = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

describe("migrateTsconfig", () => {
  it("migrateTsconfig renames the paths keys and types of the original packages", () => {
    const text = config({
      compilerOptions: {
        paths: { "openapi-fetch": ["./vendor/fetch.ts"], "openapi-fetch/*": ["./vendor/*"] },
        types: ["node", "openapi-typescript"],
      },
    });

    const migrated = migrateConfig(text);

    expect(JSON.parse(migrated.text)).toEqual({
      compilerOptions: {
        paths: {
          "openapi-typesafe-fetch": ["./vendor/fetch.ts"],
          "openapi-typesafe-fetch/*": ["./vendor/*"],
        },
        types: ["node", "openapi-typesafe"],
      },
    });
    expect(migrated.changes).toContainEqual({
      kind: "package-name-renamed",
      location: "compilerOptions.types",
      from: "openapi-typescript",
      to: "openapi-typesafe",
    });
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateTsconfig keeps comments and reports a path into node_modules of an old package", () => {
    const text = [
      "{",
      "  // the client",
      '  "compilerOptions": {',
      '    "paths": { "openapi-fetch": ["./node_modules/openapi-fetch/dist/index.d.ts"] },',
      "  },",
      "}",
      "",
    ].join("\n");

    const migrated = migrateConfig(text, "packages/a/tsconfig.build.json");

    expect(migrated.text).toBe(text.replace('{ "openapi-fetch"', '{ "openapi-typesafe-fetch"'));
    expect(migrated.manualSteps).toEqual([
      {
        kind: "old-package-path",
        location: "compilerOptions.paths.openapi-fetch.0",
        path: "./node_modules/openapi-fetch/dist/index.d.ts",
        to: "openapi-typesafe-fetch",
      },
    ]);
  });

  it.each([
    [
      "the folder of an old package",
      "./node_modules/openapi-fetch",
      ["./node_modules/openapi-fetch"],
    ],
    ["the folder of another package", "./node_modules/openapi-fetch-x", []],
  ])("migrateTsconfig reads a path to %s", (_, path, reported) => {
    const text = config({ compilerOptions: { paths: { a: [path] } } });

    const steps = migrateConfig(text, "tsconfig.json").manualSteps;

    expect(steps.map((step) => (step.kind === "old-package-path" ? step.path : step.kind))).toEqual(
      reported,
    );
  });

  it("migrateTsconfig keeps a paths key whose new name is there too", () => {
    const paths = { "openapi-fetch": ["./a.ts"], "openapi-typesafe-fetch": ["./b.ts"] };
    const text = config({ compilerOptions: { paths } });

    const migrated = migrateConfig(text, "jsconfig.json");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      {
        kind: "name-collision",
        field: "compilerOptions.paths",
        from: "openapi-fetch",
        to: "openapi-typesafe-fetch",
      },
    ]);
  });

  it("migrateTsconfig reports a config it cannot read", () => {
    const migrated = migrateConfig('{ "compilerOptions": { "types": ["openapi-typescript"] ');

    expect(migrated.manualSteps.map((step) => step.kind)).toEqual(["config-unreadable"]);
  });

  it("migrateTsconfig given an unreadable read reports it at its offset", () => {
    const text = '{ "compilerOptions": { "types": ["openapi-typescript"] ';

    const migrated = migrateTsconfig(text, { kind: "unreadable", offset: 2 });

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps.map((step) => step.kind)).toEqual(["config-unreadable"]);
  });

  it("migrateTsconfig leaves other options, and a config that names no old package", () => {
    const named = config({ extends: "./base.json", compilerOptions: { types: "openapi-fetch" } });
    const plain = config({ compilerOptions: { strict: true } });

    expect(migrateConfig(named).text).toBe(named);
    expect(migrateConfig(plain)).toEqual({ text: plain, changes: [], manualSteps: [] });
  });

  it("fileMigrationFor reads tsconfig and jsconfig files only by their names", () => {
    expect(fileMigrationFor("a/tsconfig.app.json")).toBeDefined();
    expect(fileMigrationFor("jsconfig.json")).toBeDefined();
    expect(fileMigrationFor("mytsconfig.json")).toBeUndefined();
    expect(fileMigrationFor("tsconfig.json.bak")).toBeUndefined();
  });
});
