import { describe, expect, it } from "vitest";
import { migrateMakefile } from "../../src/domain/makefile-migration.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The text `$(name)` or `${name}` of a make reference. */
const reference = (open: string, name: string, close: string): string =>
  ["$", open, name, close].join("");

describe("migrateMakefile", () => {
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
        `\t@${gen} b.yaml --immutable`,
        `\t${docker} run -it x`,
        "\t$(shell echo openapi-typescript) -it",
        "\techo $$(openapi-typesafe c.yaml --immutable)",
      ),
    );
    const locations = migrated.changes.map((change) =>
      "location" in change ? change.location : "",
    );
    expect(locations).toEqual([1, 2, 3, 6, 7, 10, 10].map((line) => `Makefile:${line}`));
  });

  it("migrateMakefile leaves an unclosed expansion to the shell, which reads a subshell", () => {
    const text = "gen:\n\topenapi-typescript a.yaml -it $(X -it\n";

    expect(migrateMakefile(text, "Makefile").text).toBe(
      "gen:\n\topenapi-typesafe a.yaml --immutable $(X -it\n",
    );
  });
});
