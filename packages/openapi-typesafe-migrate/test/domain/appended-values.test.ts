import { describe, expect, it } from "vitest";
import { migrateCommandLines } from "../../src/domain/command-migration.js";
import { migrateJustfile } from "../../src/domain/justfile-migration.js";
import { migrateMakefile } from "../../src/domain/makefile-migration.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The text `$(name)` of a make reference, or `$name` of a shell one. */
const make = (name: string): string => ["$(", name, ")"].join("");
const shell = (name: string): string => ["$", name].join("");

/** A step that says the old flags after a variable were kept. */
const keptStep = (location: string, variable: string, flags: string[]) => ({
  kind: "variable-not-only-generator",
  location,
  variable,
  flags,
});

describe("migrateMakefile and appended values", () => {
  it("migrateMakefile renames old flags appended to a variable that runs the generator", () => {
    const text = lines(
      "GEN := npx openapi-typescript",
      "GEN += --immutable-types",
      "a:",
      `\t${make("GEN")} a.yaml`,
    );

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toBe(
      lines("GEN := npx openapi-typesafe", "GEN += --immutable", "a:", `\t${make("GEN")} a.yaml`),
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateMakefile reads text appended to an empty value as the value", () => {
    const text = lines(
      "CMD =",
      "CMD += npx openapi-typescript",
      "b:",
      `\t${make("CMD")} b.yaml -it`,
    );

    expect(migrateMakefile(text, "build.mk").text).toBe(
      lines("CMD =", "CMD += npx openapi-typesafe", "b:", `\t${make("CMD")} b.yaml --immutable`),
    );
  });

  it("migrateMakefile reports flags appended to a variable that may run another program", () => {
    const text = lines(
      "GEN := openapi-typescript",
      "GEN := mytool",
      "GEN += -it",
      "a:",
      `\t${make("GEN")} a.yaml`,
    );

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toContain("GEN += -it");
    expect(migrated.manualSteps).toEqual([keptStep("Makefile:3", make("GEN"), ["-it"])]);
  });

  it("migrateMakefile reports flags appended to a value from outside the file", () => {
    const text = lines("GEN += -it", "a:", `\t${make("GEN")} a.yaml`);

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([keptStep("Makefile:1", make("GEN"), ["-it"])]);
  });

  it("migrateMakefile keeps flags appended to a variable that runs another program", () => {
    const text = lines("GEN := docker run", "GEN += -it", "a:", `\t${make("GEN")} x`);

    expect(migrateMakefile(text, "Makefile")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migrateMakefile reports an old name appended to a variable that runs another program", () => {
    const text = lines("GEN := docker run", "GEN += openapi-typescript -it", "a:", "\t$(GEN)");

    const migrated = migrateMakefile(text, "Makefile");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "Makefile:2", word: "openapi-typescript" },
    ]);
  });
});

describe("migrateCommandLines and appended shell values", () => {
  it("migrateCommandLines renames old flags appended to a variable that runs the generator", () => {
    const text = lines('G="npx openapi-typescript"', 'G+=" -it"', `${shell("G")} c.yaml`);

    expect(migrateCommandLines(text, "gen.bash").text).toBe(
      lines('G="npx openapi-typesafe"', 'G+=" --immutable"', `${shell("G")} c.yaml`),
    );
  });

  it("migrateCommandLines reports flags appended to a variable the text does not set", () => {
    const text = lines('G+=" -it"', `${shell("G")} c.yaml`);

    const migrated = migrateCommandLines(text, "gen.bash");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([keptStep("gen.bash:1", shell("G"), ["-it"])]);
  });

  it("migrateCommandLines reports flags in an appended value of several parts", () => {
    const text = lines('G="npx openapi-typescript"', `G+=" -it "${shell("X")}`, shell("G"));

    const migrated = migrateCommandLines(text, "gen.bash");

    expect(migrated.text).toContain(`G+=" -it "${shell("X")}`);
    expect(migrated.manualSteps).toEqual([keptStep("gen.bash:2", shell("G"), ["-it"])]);
  });

  it("migrateCommandLines keeps flags appended to a variable that runs another program", () => {
    const text = lines('G="docker run"', 'G+=" -it"', `${shell("G")} x`);

    expect(migrateCommandLines(text, "run.bash")).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migrateCommandLines reports an old name appended to a variable of another program", () => {
    const text = lines('G="docker run"', 'G+=" openapi-typescript -it"', `${shell("G")} x`);

    const migrated = migrateCommandLines(text, "run.bash");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "run.bash:2", word: "openapi-typescript" },
    ]);
  });

  it("migrateCommandLines reads an appending assignment before a command as an assignment", () => {
    const text = "G+=x openapi-typescript a.yaml -it\n";

    expect(migrateCommandLines(text, "gen.bash").text).toBe(
      "G+=x openapi-typesafe a.yaml --immutable\n",
    );
  });
});

describe("migrateJustfile and concatenated values", () => {
  it("migrateJustfile renames old flags in a string joined to the generator", () => {
    const text = lines(`gen := "npx openapi-typescript" + " -it"`, "d:", "    {{gen}} d.yaml");

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toBe(
      lines(`gen := "npx openapi-typesafe" + " --immutable"`, "d:", "    {{gen}} d.yaml"),
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateJustfile renames old flags joined to a variable that runs the generator", () => {
    const text = lines(
      `base := "npx openapi-typescript"`,
      `gen := base + ' -it'`,
      "d:",
      "    {{gen}} d.yaml -ap",
    );

    expect(migrateJustfile(text, "justfile").text).toBe(
      lines(
        `base := "npx openapi-typesafe"`,
        `gen := base + ' --immutable'`,
        "d:",
        "    {{gen}} d.yaml --additional-properties",
      ),
    );
  });

  it("migrateJustfile reports old flags joined after a variable part", () => {
    const text = lines(`gen := "npx openapi-typescript" + suffix + " -it"`, "d:", "    {{gen}}");

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toContain(`+ " -it"`);
    expect(migrated.manualSteps).toEqual([keptStep("justfile:1", "gen", ["-it"])]);
  });

  it("migrateJustfile reports old flags joined inside a word of the program", () => {
    const text = lines(`gen := "npx openapi-typescript" + "-it -ap"`, "d:", "    {{gen}}");

    const migrated = migrateJustfile(text, "justfile");

    expect(migrated.text).toContain(`"-it -ap"`);
    expect(migrated.manualSteps).toEqual([keptStep("justfile:1", "gen", ["-it", "-ap"])]);
  });

  it("migrateJustfile reads a command after a semicolon of a joined string as a command", () => {
    const text = lines(`gen := "echo" + " x; openapi-typescript a.yaml -it"`, "d:", "    {{gen}}");

    expect(migrateJustfile(text, "justfile").text).toContain(
      `"echo" + " x; openapi-typesafe a.yaml --immutable"`,
    );
  });

  it("migrateJustfile reads a joined value as the text of its variable", () => {
    const text = lines(`flags := "-o x -i" + "t"`, "d:", "    openapi-typescript a.yaml {{flags}}");

    expect(migrateJustfile(text, "justfile").manualSteps).toEqual([
      {
        kind: "flags-in-variable",
        location: "justfile:3",
        variable: "{{flags}}",
        flags: ["-it"],
      },
    ]);
  });
});
