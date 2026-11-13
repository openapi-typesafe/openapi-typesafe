import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { type DocumentString, documentStrings } from "../../src/domain/config-documents.js";
import { migrateMakefile } from "../../src/domain/makefile-migration.js";
import { variablePrograms } from "../../src/domain/variable-programs.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const yaml = createYamlTextReader();
function stringsOf(text: string): DocumentString[] {
  const read = yaml.read(text);
  return read.kind === "read" ? documentStrings(read.documents) : [];
}

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
/** `${{ body }}`, built so that no template literal holds the text `${`. */
const expression = (body: string): string => ["$", "{{ ", body, " }}"].join("");
/** A make reference such as `$(GEN)`, built so that no template literal holds `${`. */
const reference = (name: string): string => ["$", "(", name, ")"].join("");

const uncertain = (location: string, variable: string) => ({
  kind: "variable-not-only-generator",
  location,
  variable,
  flags: ["-it"],
});

describe("programs that the run decides", () => {
  it("variablePrograms gives generator-or-other for a run-time definition", () => {
    const programs = variablePrograms([{ name: "GEN", kind: "run-time" }]);

    expect(programs.get("GEN")).toBe("generator-or-other");
  });

  it("migrateYamlCommands keeps and reports the flags after an env set by an expression", () => {
    const text = lines(
      "jobs:",
      "  a:",
      "    env:",
      `      GEN: ${expression("vars.GEN || 'npx openapi-typescript'")}`,
      `      ONLY: ${expression("vars.ONLY")}`,
      "    steps:",
      "      - run: $GEN api.yaml -it",
      "      - run: $ONLY api.yaml -it",
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toBe(text.replace("typescript'", "typesafe'"));
    expect(migrated.manualSteps).toEqual([
      uncertain("ci.yml:7", "$GEN"),
      uncertain("ci.yml:8", "$ONLY"),
    ]);
  });

  it("migrateYamlCommands still renames the flags after an env set to the generator", () => {
    const text = lines(
      "jobs:",
      "  a:",
      "    env:",
      `      GEN: npx openapi-typescript ${expression("inputs.flags")}`,
      "    steps:",
      "      - run: $GEN api.yaml -it",
    );

    const migrated = migrateYamlCommands(text, "ci.yml", stringsOf(text));

    expect(migrated.text).toContain("$GEN api.yaml --immutable");
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateMakefile keeps and reports the flags after a variable set with ?=", () => {
    const text = lines("GEN ?= npx openapi-typescript", "gen:", `\t${reference("GEN")} e.yaml -it`);

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
    expect(migrated.manualSteps).toEqual([uncertain("Makefile:3", reference("GEN"))]);
  });

  it("migrateMakefile keeps and reports the flags after a variable that make computes", () => {
    const computed = `$(or ${reference("X")},npx openapi-typescript)`;
    const text = lines(`GEN := ${computed}`, "gen:", `\t${reference("GEN")} e.yaml -it`);

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.manualSteps).toEqual([uncertain("Makefile:3", reference("GEN"))]);
  });

  it("migrateMakefile renames the flags after a variable set to a reference with words", () => {
    const text = lines(
      "OAT := npx openapi-typescript",
      `GEN := ${reference("OAT")} --redoc r.yaml`,
      "gen:",
      `\t${reference("GEN")} e.yaml -it`,
    );

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toContain("e.yaml --immutable");
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateMakefile reads only the commands in a value for what it sets", () => {
    const text = lines(
      "GEN := docker",
      "gen:",
      "\tnpx openapi-typescript a.yaml",
      `\t${reference("GEN")} run -it x`,
    );

    expect(migrateMakefile(text, "Makefile").text).toContain("run -it x");
  });
});
