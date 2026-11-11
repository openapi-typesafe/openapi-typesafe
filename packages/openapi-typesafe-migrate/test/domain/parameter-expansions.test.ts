import { describe, expect, it } from "vitest";
import { migrateCommand, migrateCommandLines } from "../../src/domain/command-migration.js";
import { wholeWordExpansion, wordExpansions } from "../../src/domain/parameter-expansions.js";
import { shellCommands } from "../../src/domain/shell-words.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
/** Shell text with `$`, kept out of template literals so the linter sees no placeholder. */
const dollar = (text: string): string => text.replaceAll("@", "$");

describe("wordExpansions", () => {
  it("wordExpansions reads the variable, the use and the word of each expansion with a word", () => {
    const found = wordExpansions(dollar("a@{A:-x y}b@{B=z}@{C:+w}@{D}"));

    expect(found.map(({ name, use, text }) => ({ name, use, text }))).toEqual([
      { name: "A", use: "default", text: "x y" },
      { name: "B", use: "assign", text: "z" },
      { name: "C", use: "alternative", text: "w" },
    ]);
    expect(found[0]).toMatchObject({ start: 6, expansionStart: 1, expansionEnd: 10 });
  });

  it("wordExpansions skips single quotes and escapes, and reads double quotes", () => {
    expect(
      wordExpansions(dollar("'@{A:-x}' \\@{B:-y} \"@{C:-z}\"")).map(({ name }) => name),
    ).toEqual(["C"]);
  });

  it("wordExpansions reads a nested expansion as part of the outer word", () => {
    expect(wordExpansions(dollar("@{A:-@{B:-x} y}")).map(({ text }) => text)).toEqual([
      dollar("@{B:-x} y"),
    ]);
  });

  it("wordExpansions reads nothing of an expansion without its closing brace", () => {
    expect(wordExpansions(dollar("@{A:-x"))).toEqual([]);
  });
});

describe("wholeWordExpansion", () => {
  it("wholeWordExpansion gives an expansion that is the whole word, also double quoted", () => {
    expect(wholeWordExpansion(dollar("@{A:-x}"))?.name).toBe("A");
    expect(wholeWordExpansion(dollar('"@{A:-x}"'))?.name).toBe("A");
  });

  it("wholeWordExpansion gives nothing for an expansion that is a part of the word", () => {
    expect(wholeWordExpansion(dollar("a@{A:-x}"))).toBeUndefined();
    expect(wholeWordExpansion(dollar("@{A:-x}b"))).toBeUndefined();
    expect(wholeWordExpansion(dollar('"@{A:-x}'))).toBeUndefined();
    expect(wholeWordExpansion(dollar("@{A}"))).toBeUndefined();
  });
});

describe("shellCommands and parameter expansions", () => {
  it("shellCommands reads the word of an expansion as a command line where it is written", () => {
    const commands = shellCommands(dollar("echo @{GEN:-npx openapi-typescript}"));

    expect(commands.map((command) => command.map(({ value }) => value))).toEqual([
      ["echo", dollar("@{GEN:-npx openapi-typescript}")],
      ["npx", "openapi-typescript"],
    ]);
    expect(commands[1]?.[1]).toMatchObject({ start: 16, end: 34 });
  });
});

describe("migrateCommandLines and parameter expansions", () => {
  it("migrateCommandLines renames the package in the word of an expansion after a launcher", () => {
    const migrated = migrateCommand(dollar("npx @{GEN:-openapi-typescript} a.yaml -it"), "s");

    expect(migrated.text).toBe(dollar("npx @{GEN:-openapi-typesafe} a.yaml -it"));
    expect(migrated.manualSteps).toEqual([
      expect.objectContaining({ kind: "variable-not-only-generator", flags: ["-it"] }),
    ]);
  });

  it("migrateCommandLines leaves an expansion in single quotes", () => {
    const text = "echo '@{X:-openapi-typescript}'";

    expect(migrateCommand(dollar(text), "scripts.gen").text).toBe(dollar(text));
  });

  it("migrateCommandLines migrates a program word whose word and variable run the generator", () => {
    const text = lines(
      "GEN=openapi-typescript",
      dollar('OAT="@GEN"; "@{OAT:-@GEN}" a.yaml -it'),
      dollar("@{GEN-openapi-typescript} b.yaml -it"),
    );

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toBe(
      lines(
        "GEN=openapi-typesafe",
        dollar('OAT="@GEN"; "@{OAT:-@GEN}" a.yaml --immutable'),
        dollar("@{GEN-openapi-typesafe} b.yaml --immutable"),
      ),
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateCommandLines reports the flags of a default whose variable comes from outside", () => {
    const text = lines(
      dollar('OAT="@{OAT:-npx openapi-typescript}"'),
      dollar("@OAT a.yaml -it"),
      dollar("@{GEN:-openapi-typescript} b.yaml -it"),
      dollar("@{GEN:+openapi-typescript} c.yaml -it"),
    );

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toBe(
      lines(
        dollar('OAT="@{OAT:-npx openapi-typesafe}"'),
        dollar("@OAT a.yaml -it"),
        dollar("@{GEN:-openapi-typesafe} b.yaml -it"),
        dollar("@{GEN:+openapi-typesafe} c.yaml -it"),
      ),
    );
    expect(migrated.manualSteps).toEqual(
      ["gen.sh:2", "gen.sh:3", "gen.sh:4"].map((location) =>
        expect.objectContaining({ kind: "variable-not-only-generator", location }),
      ),
    );
  });

  it("migrateCommandLines reports an alternative, which is empty when its variable is unset", () => {
    const text = lines(
      "GEN=openapi-typescript",
      dollar('OAT="@{GEN:+npx openapi-typescript}"; @OAT a.yaml -it'),
      dollar("@{GEN:+openapi-typescript} b.yaml -it"),
    );

    expect(migrateCommandLines(text, "gen.sh").manualSteps).toEqual(
      ["gen.sh:2", "gen.sh:3"].map((location) =>
        expect.objectContaining({ kind: "variable-not-only-generator", location }),
      ),
    );
  });

  it("migrateCommandLines reads a variable that an assigning expansion sets", () => {
    const text = lines(dollar(': "@{OAT:=npx openapi-typescript}"'), dollar("@OAT a.yaml -it"));

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toBe(
      lines(dollar(': "@{OAT:=npx openapi-typesafe}"'), dollar("@OAT a.yaml -it")),
    );
    expect(migrated.manualSteps).toEqual([
      expect.objectContaining({ kind: "variable-not-only-generator", location: "gen.sh:2" }),
    ]);
  });

  it("migrateCommandLines reads a default that refers to a variable set to the generator", () => {
    const text = lines(
      "GEN=openapi-typescript",
      dollar('OAT="@{OTHER:-@GEN}"'),
      dollar("@OAT a.yaml -it"),
    );

    expect(migrateCommandLines(text, "gen.sh").manualSteps).toEqual([
      expect.objectContaining({ kind: "variable-not-only-generator", location: "gen.sh:3" }),
    ]);
  });
});
