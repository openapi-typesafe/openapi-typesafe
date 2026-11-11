import { describe, expect, it } from "vitest";
import { createJsonTextReader } from "../../src/adapters/json-text/json-text.js";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { fileMigrationFor } from "../../src/application/file-migrations.js";
import { NO_CATALOG_PLAN } from "../../src/domain/catalog-plan.js";
import { migrateJustfile } from "../../src/domain/justfile-migration.js";
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

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

describe("migrateJustfile", () => {
  it("migrateJustfile migrates a variable set to the generator and the flags of its uses", () => {
    const text = lines(
      `gen := "npx openapi-typescript"`,
      "export run := gen",
      "",
      "gen:",
      "    {{gen}} a.yaml -it",
      "    @{{ run }} b.yaml -it",
      "    openapi-typescript c.yaml -it",
    );

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toBe(
      lines(
        `gen := "npx openapi-typesafe"`,
        "export run := gen",
        "",
        "gen:",
        "    {{gen}} a.yaml --immutable",
        "    @{{ run }} b.yaml --immutable",
        "    openapi-typesafe c.yaml --immutable",
      ),
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateJustfile reads values before a comment and with escaped quotes", () => {
    const text = lines(
      `gen := "openapi-typescript -o \\"a b.ts\\" -it" # the generator`,
      "run := gen # an alias",
      "gen:",
      "    {{run}} a.yaml -it",
    );

    expect(migrateJustfile(text, "justfile").text).toBe(
      lines(
        `gen := "openapi-typesafe -o \\"a b.ts\\" --immutable" # the generator`,
        "run := gen # an alias",
        "gen:",
        "    {{run}} a.yaml --immutable",
      ),
    );
  });

  it("migrateJustfile reports old flags in a variable that the generator gets", () => {
    const text = lines("flags := '-it'", "gen:", "    openapi-typescript a.yaml {{flags}}");

    expect(migrateJustfile(text, "justfile").manualSteps).toEqual([
      { kind: "flags-in-variable", location: "justfile:3", variable: "{{flags}}", flags: ["-it"] },
    ]);
  });

  it("migrateJustfile leaves the flags after a variable whose value just computes", () => {
    for (const value of [`env("GEN", "openapi-typescript")`, `openapi-typescript + " x"`]) {
      const text = lines(`gen := ${value}`, "gen:", "    {{gen}} a.yaml -it");

      expect(migrateJustfile(text, "justfile").text).toBe(text);
    }
  });

  it("migrateJustfile leaves the flags after an expression that is not one variable", () => {
    const text = lines(`gen := "openapi-typescript"`, "gen:", "    {{gen + 'x'}} a.yaml -it");

    expect(migrateJustfile(text, "justfile").text).toBe(
      lines(`gen := "openapi-typesafe"`, "gen:", "    {{gen + 'x'}} a.yaml -it"),
    );
  });
});

describe("fileMigrationFor and justfiles", () => {
  it("fileMigrationFor migrates each justfile name with the justfile migration", () => {
    const text = lines(`gen := "openapi-typescript"`, "gen:", "    {{gen}} a.yaml -it");
    const expected = lines(`gen := "openapi-typesafe"`, "gen:", "    {{gen}} a.yaml --immutable");

    for (const name of ["justfile", "Justfile", "tools/.justfile"]) {
      const migrate = fileMigrationFor(name);

      expect(migrate?.(text, name, context).text).toBe(expected);
    }
  });
});
