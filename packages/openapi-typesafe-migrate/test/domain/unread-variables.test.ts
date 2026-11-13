import { describe, expect, it } from "vitest";
import { createYamlTextReader } from "../../src/adapters/yaml-text/yaml-text.js";
import { migrateCommandLines } from "../../src/domain/command-migration.js";
import { documentStrings } from "../../src/domain/config-documents.js";
import { migrateMakefile } from "../../src/domain/makefile-migration.js";
import { shellCommands } from "../../src/domain/shell-words.js";
import { migrateYamlCommands } from "../../src/domain/yaml-migration.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
/** Shell text with `$`, kept out of template literals so the linter sees no placeholder. */
const dollar = (text: string): string => text.replaceAll("@", "$");
/** All items of the bash array `GEN`. */
const ARRAY = ["$", "{GEN[@]}"].join("");

const yaml = createYamlTextReader();
function migrateYaml(text: string) {
  const read = yaml.read(text);
  return migrateYamlCommands(
    text,
    "ci.yml",
    read.kind === "read" ? documentStrings(read.documents) : [],
  );
}

/** The variable and location of each step that says the flags after a variable were kept. */
const keptFlagSteps = (steps: readonly { kind: string }[]) =>
  steps.filter((step) => step.kind === "variable-not-only-generator");

describe("shellCommands and bash arrays", () => {
  const valuesOf = (text: string) =>
    shellCommands(text).map((command) => command.map(({ value }) => value));

  it("shellCommands reads an array assignment as one word and its items as a command line", () => {
    expect(valuesOf("GEN=(npx \\) (c)) x; y")).toEqual([
      ["GEN=(npx \\) (c))", "x"],
      ["npx", ")"],
      ["c"],
      ["y"],
    ]);
    expect(valuesOf("A+=(x) z")).toEqual([["A+=(x)", "z"], ["x"]]);
  });

  it("shellCommands reads an unclosed array or a parenthesis after a word as before", () => {
    expect(valuesOf("GEN=(npx a")).toEqual([["GEN="], ["npx", "a"]]);
    expect(valuesOf("GEN= (a)")).toEqual([["GEN="], ["a"]]);
    expect(valuesOf("echo=x(a)")).toEqual([["echo=x"], ["x"], ["a"]]);
  });
});

describe("unread variables", () => {
  it("migrateCommandLines reports the old flags after a variable that the text does not set", () => {
    const text = lines(
      dollar("@GEN a.yaml -it"),
      dollar('"@{GEN}" b.yaml -it'),
      `GEN=(npx openapi-typescript); "${ARRAY}" c.yaml -it`,
    );

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toContain(dollar("@GEN a.yaml -it"));
    expect(migrated.text).toContain("GEN=(npx openapi-typesafe);");
    expect(migrated.manualSteps).toEqual(
      [
        { location: "gen.sh:1", variable: dollar("@GEN") },
        { location: "gen.sh:2", variable: dollar('"@{GEN}"') },
        { location: "gen.sh:3", variable: `"${ARRAY}"` },
      ].map((step) =>
        expect.objectContaining({ kind: "variable-not-only-generator", flags: ["-it"], ...step }),
      ),
    );
  });

  it("migrateCommandLines reports nothing after a variable without old flags or set to another tool", () => {
    const text = lines(
      dollar("@GEN a.yaml --immutable"),
      dollar("GEN=prettier; @GEN b.yaml -it"),
      dollar("@{GEN}x c.yaml -it"),
      dollar("x@GEN e.yaml -it"),
      dollar("@1 d.yaml -it"),
    );

    expect(keptFlagSteps(migrateCommandLines(text, "gen.sh").manualSteps)).toEqual([]);
  });

  it("migrateMakefile reports the old flags after a recipe shell variable and an unset make variable", () => {
    const text = lines(
      "gen:",
      dollar('\tGEN="npx openapi-typescript"; @@GEN a.yaml -it'),
      dollar("\t@(OAT) b.yaml -it"),
    );

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toContain(dollar('GEN="npx openapi-typesafe"; @@GEN a.yaml -it'));
    expect(keptFlagSteps(migrated.manualSteps)).toEqual(
      [
        { location: "Makefile:2", variable: dollar("@@GEN") },
        { location: "Makefile:3", variable: dollar("@(OAT)") },
      ].map((step) => expect.objectContaining(step)),
    );
  });

  it("migrateYamlCommands reports the old flags after a variable set by another item or step", () => {
    const text = lines(
      "gen:",
      "  script:",
      '    - GEN="npx openapi-typescript"',
      dollar("    - @GEN a.yaml -it"),
      "jobs:",
      "  a:",
      "    steps:",
      dollar('      - run: echo "OAT=npx openapi-typescript" >> "@GITHUB_ENV"'),
      dollar("      - run: @OAT b.yaml -it"),
    );

    const migrated = migrateYaml(text);

    expect(keptFlagSteps(migrated.manualSteps)).toEqual(
      [
        { location: "ci.yml:4", variable: dollar("@GEN") },
        { location: "ci.yml:9", variable: dollar("@OAT") },
      ].map((step) => expect.objectContaining(step)),
    );
  });
});
