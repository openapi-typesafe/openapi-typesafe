import { describe, expect, it } from "vitest";
import { migrateMakefile } from "../../src/domain/makefile-migration.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The text `$(name)` or `${name}` of a make reference. */
const reference = (open: string, name: string, close: string): string =>
  ["$", open, name, close].join("");

describe("migrateMakefile", () => {
  it("migrateMakefile reports the flags after a variable that a later line sets to another tool", () => {
    const g = reference("(", "G", ")");
    const text = lines("G := openapi-typescript", "gen:", `\t${g} build -it`, "G := mytool");

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toBe(text.replace("G := openapi-typescript", "G := openapi-typesafe"));
    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "Makefile:3",
        variable: g,
        flags: ["-it"],
      },
    ]);
  });

  it("migrateMakefile keeps the program of a variable that += adds flags to", () => {
    const g = reference("(", "G", ")");
    const text = lines("G := openapi-typescript", "G += --redoc r.yaml", "gen:", `\t${g} -it`);

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toBe(
      lines("G := openapi-typesafe", "G += --redocly r.yaml", "gen:", `\t${g} --immutable`),
    );
  });

  it("migrateMakefile migrates a variable that holds the generator, and its uses", () => {
    const oat = reference("(", "OAT", ")");
    const gen = reference("{", "GEN", "}");
    const docker = reference("(", "DOCKER", ")");
    const text = lines(
      "OAT := openapi-typescript",
      "export GEN ?= npx openapi-typescript \\",
      "  --redoc r.yaml",
      "DOCKER = docker",
      "gen:",
      `\t${oat} a.yaml -it`,
      `\t@${gen} b.yaml -it`,
      `\t${docker} run -it x`,
      "\t$(shell echo openapi-typescript) -it",
      "\techo $$(openapi-typescript c.yaml -it)",
    );

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toBe(
      lines(
        "OAT := openapi-typesafe",
        "export GEN ?= npx openapi-typesafe \\",
        "  --redocly r.yaml",
        "DOCKER = docker",
        "gen:",
        `\t${oat} a.yaml --immutable`,
        `\t@${gen} b.yaml -it`,
        `\t${docker} run -it x`,
        "\t$(shell echo openapi-typescript) -it",
        "\techo $$(openapi-typesafe c.yaml --immutable)",
      ),
    );
    const locations = migrated.changes.map((change) =>
      "location" in change ? change.location : "",
    );
    expect(locations).toEqual([1, 2, 3, 6, 10, 10].map((line) => `Makefile:${line}`));
  });

  it("migrateMakefile follows variables set to the generator variable and target variables", () => {
    const [oat, gen, tv] = ["OAT", "GEN", "TV"].map((name) => reference("(", name, ")"));
    const text = lines(
      "OAT := openapi-typescript",
      `GEN := ${oat}`,
      "gen: TV := openapi-typescript",
      "gen:",
      `\t${gen} a.yaml -it`,
      `\t${tv} b.yaml -it`,
    );

    expect(migrateMakefile(text, "Makefile").text).toBe(
      lines(
        "OAT := openapi-typesafe",
        `GEN := ${oat}`,
        "gen: TV := openapi-typesafe",
        "gen:",
        `\t${gen} a.yaml --immutable`,
        `\t${tv} b.yaml --immutable`,
      ),
    );
  });

  it("migrateMakefile reports a variable of old flags that the generator gets", () => {
    const [flags, spec] = ["FLAGS", "SPEC"].map((name) => reference("(", name, ")"));
    const text = lines(
      "FLAGS := -it --redoc r.yaml",
      "SPEC := api.yaml",
      "gen:",
      `\topenapi-typescript ${spec} ${flags}`,
      `\tdocker run ${flags}`,
    );

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toBe(text.replace("\topenapi-typescript", "\topenapi-typesafe"));
    expect(migrated.manualSteps).toEqual([
      {
        kind: "flags-in-variable",
        location: "Makefile:4",
        variable: flags,
        flags: ["-it", "--redoc"],
      },
    ]);
  });

  it("migrateMakefile leaves an unclosed expansion to the shell, which reads a subshell", () => {
    const text = "gen:\n\topenapi-typescript a.yaml -it $(X -it\n";

    expect(migrateMakefile(text, "Makefile").text).toBe(
      "gen:\n\topenapi-typesafe a.yaml --immutable $(X -it\n",
    );
  });
});

describe("migrateMakefile and one-letter variables", () => {
  it("migrateMakefile follows a one-letter variable written without parentheses", () => {
    const text = lines("G := openapi-typescript", "gen:", "\t$G g.yaml -it", "\t$Gx g.yaml -it");

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toBe(
      lines("G := openapi-typesafe", "gen:", "\t$G g.yaml --immutable", "\t$Gx g.yaml -it"),
    );
  });
});

describe("migrateMakefile and computed programs", () => {
  it("migrateMakefile reports the flags after a make function as written", () => {
    const program = "$(or $(GEN),npx openapi-typescript)";
    const text = lines("gen:", `\t@${program} b.yaml -it`, "\tmytool b.yaml -it");

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.manualSteps).toEqual([
      {
        kind: "variable-not-only-generator",
        location: "Makefile:2",
        variable: `@${program}`,
        flags: ["-it"],
      },
    ]);
  });
});
