import { describe, expect, it } from "vitest";
import { migrateMakefile } from "../../src/domain/makefile-migration.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The text `$(name)` of a make reference. */
const use = (name: string): string => ["$(", name, ")"].join("");

/** A step that says the old flags after a variable were kept. */
const keptStep = (line: number, name: string) => ({
  kind: "variable-not-only-generator",
  location: `Makefile:${line}`,
  variable: use(name),
  flags: ["-it"],
});

/** A step that says an old name was kept where the tool cannot tell what runs it. */
const oldNameStep = (line: number) => ({
  kind: "old-name-in-command",
  location: `Makefile:${line}`,
  word: "openapi-typescript",
});

const migrated = (text: string) => migrateMakefile(text, "Makefile");
const renamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable");

describe("migrateMakefile and the values make builds", () => {
  it.each([
    ["G := npx", "G += openapi-typescript"],
    ["G = npx", "G += openapi-typescript"],
    ["override G := npx", "override G += openapi-typescript"],
    ["export G := npx", "export G += openapi-typescript"],
    ["G :=", "G += npx openapi-typescript"],
    ["G := npx", "G := $(G) openapi-typescript"],
    ["NPX := npx", "G := $(NPX) openapi-typescript"],
  ])("migrateMakefile reads %s and %s as one generator command", (first, second) => {
    const text = lines(first, second, "gen:", `\t${use("G")} a.yaml -it`);

    expect(migrated(text)).toMatchObject({ text: renamed(text), manualSteps: [] });
  });

  it("migrateMakefile reads the arguments a later append gives a generator value", () => {
    const text = lines(
      "G := npx openapi-typescript",
      "G += $(if $(CI),-it,)",
      "G += --redoc r.yaml",
      "gen:",
      `\t${use("G")} a.yaml`,
    );

    expect(migrated(text).text).toBe(renamed(text).replace("--redoc", "--redocly"));
  });

  it("migrateMakefile reads a value from outside that ?= leaves, before an append", () => {
    const text = lines("G ?= npx", "G += openapi-typescript", "gen:", `\t${use("G")} a.yaml -it`);

    expect(migrated(text)).toMatchObject({
      text,
      manualSteps: [oldNameStep(2), keptStep(4, "G")],
    });
  });

  it("migrateMakefile leaves a plain append to a value that override set", () => {
    const text = lines(
      "override G := npx",
      "G += openapi-typescript",
      "G ?= other",
      "gen:",
      `\t${use("G")} a.yaml -it`,
    );

    expect(migrated(text).text).toBe(text.replace("+= openapi-typescript", "+= openapi-typesafe"));
  });

  it("migrateMakefile expands an immediate reference where make reads it", () => {
    const text = lines(
      "O := openapi-typescript",
      `I := ${use("O")}`,
      `R = ${use("O")}`,
      "O := mytool",
      "gen:",
      `\t${use("I")} a.yaml -it`,
      `\t${use("R")} b.yaml -it`,
    );

    expect(migrated(text).text).toBe(
      text
        .replace("= openapi-typescript", "= openapi-typesafe")
        .replace("a.yaml -it", "a.yaml --immutable"),
    );
  });

  it("migrateMakefile reads a recursive value that uses itself as no generator", () => {
    const text = lines(`G = ${use("G")} openapi-typescript`, "gen:", `\t${use("G")} a.yaml -it`);

    expect(migrated(text).manualSteps).toEqual([oldNameStep(1)]);
  });

  it("migrateMakefile reads a value that a computed one starts as a run-time program", () => {
    const text = lines(
      "G != echo npx",
      "G += openapi-typescript",
      "gen:",
      `\t${use("G")} a.yaml -it`,
    );
    expect(migrated(text)).toMatchObject({
      text: text.replace("+= openapi-typescript", "+= openapi-typesafe"),
      manualSteps: [keptStep(4, "G")],
    });
  });
});

describe("migrateMakefile and conditional values", () => {
  it("migrateMakefile reports an append after branches that run different programs", () => {
    const text = lines(
      "ifeq ($(CI),1)",
      "G := mytool",
      "else",
      "G := npx",
      "endif",
      "G += openapi-typescript",
      "gen:",
      `\t${use("G")} a.yaml -it`,
    );

    expect(migrated(text)).toMatchObject({
      text,
      manualSteps: [oldNameStep(6), keptStep(8, "G")],
    });
  });

  it("migrateMakefile keeps the value before a block without else as one branch", () => {
    const text = lines(
      "G := npx openapi-typescript",
      "ifdef CI",
      "G := mytool",
      "else ifdef LOCAL",
      "G := other",
      "endif",
      "endif",
      "gen:",
      `\t${use("G")} a.yaml -it`,
    );

    expect(migrated(text).manualSteps).toEqual([keptStep(9, "G")]);
  });

  it("migrateMakefile reads one value when both branches run the generator", () => {
    const text = lines(
      "ifdef CI",
      "G := npx openapi-typescript",
      "else",
      "G := pnpm exec openapi-typescript",
      "endif",
      "gen:",
      `\t${use("G")} a.yaml -it`,
    );

    expect(migrated(text)).toMatchObject({ text: renamed(text), manualSteps: [] });
  });

  it("migrateMakefile reads an unclosed block as branches up to the end", () => {
    const text = lines(
      "G := npx openapi-typescript",
      "gen:",
      `\t${use("G")} a.yaml -it`,
      "ifdef CI",
      "G := mytool",
    );

    expect(migrated(text).manualSteps).toEqual([keptStep(3, "G")]);
  });

  it("migrateMakefile reads a reference whose values differ where make reads it", () => {
    const text = lines(
      "O := openapi-typescript",
      "ifdef CI",
      "O := mytool",
      "endif",
      `G := ${use("O")} -it`,
      "O := grep",
      "gen:",
      `\t${use("G")} a.yaml`,
    );

    expect(migrated(text).manualSteps).toEqual([{ ...keptStep(5, "O") }]);
  });
});

describe("migrateMakefile and values it cannot follow", () => {
  it("migrateMakefile reports a value that starts with a variable from outside", () => {
    const text = lines(`G := ${use("X")} --redoc r.yaml`, "gen:", `\t${use("G")} a.yaml -it`);

    expect(migrated(text)).toMatchObject({
      text,
      manualSteps: [{ ...keptStep(1, "X"), flags: ["--redoc"] }, keptStep(3, "G")],
    });
  });

  it("migrateMakefile keeps the value that ?= leaves, after one the file sets", () => {
    const text = lines("G := npx openapi-typescript", "G ?= mytool", "gen:", `\t${use("G")} a -it`);

    expect(migrated(text)).toMatchObject({ text: renamed(text), manualSteps: [] });
  });

  it("migrateMakefile reports a function's command line appended to another program", () => {
    const text = lines(
      "G := mytool",
      "G += $(if $(CI),npx openapi-typescript -it)",
      "gen:",
      `\t${use("G")} a.yaml`,
    );

    expect(migrated(text)).toMatchObject({ text, manualSteps: [oldNameStep(2)] });
  });
});

describe("migrateMakefile and values for some targets", () => {
  it("migrateMakefile reads an append for a target in its recipes and its prerequisites", () => {
    const text = lines(
      "G := npx",
      "gen: G += openapi-typescript",
      "gen: lib",
      `\t${use("G")} a.yaml -it`,
      "lib:",
      `\t${use("G")} b.yaml -it`,
      "other:",
      `\t${use("G")} c.yaml -it`,
    );

    expect(migrated(text)).toMatchObject({
      text: text
        .replace("+= openapi-typescript", "+= openapi-typesafe")
        .replace("a.yaml -it", "a.yaml --immutable"),
      manualSteps: [keptStep(6, "G")],
    });
  });

  it("migrateMakefile keeps a private target value from the prerequisites", () => {
    const text = lines(
      "G := mytool",
      "gen: private G := npx openapi-typescript",
      "gen: lib ; @echo inline",
      "lib:",
      `\t${use("G")} b.yaml -it`,
    );

    expect(migrated(text)).toMatchObject({
      text: text.replace("npx openapi-typescript", "npx openapi-typesafe"),
      manualSteps: [],
    });
  });

  it("migrateMakefile reads a value for a pattern of targets in the targets it names", () => {
    const text = lines(
      "G := mytool",
      "gen-%: G := npx openapi-typescript",
      "gen-api:",
      `\t${use("G")} a.yaml -it`,
      "lint:",
      `\t${use("G")} b.yaml -it`,
    );

    expect(migrated(text).text).toBe(
      text
        .replace("npx openapi-typescript", "npx openapi-typesafe")
        .replace("a.yaml -it", "a.yaml --immutable"),
    );
  });

  it("migrateMakefile reads a target value inside a block as one of two", () => {
    const text = lines(
      "G := npx openapi-typescript",
      "ifdef CI",
      "gen: G := mytool",
      "endif",
      "gen:",
      `\t${use("G")} a.yaml -it`,
    );

    expect(migrated(text).manualSteps).toEqual([keptStep(6, "G")]);
  });
});

describe("migrateMakefile and the rules of targets", () => {
  it("migrateMakefile reads only real prerequisites as targets that inherit values", () => {
    const text = lines(
      "G := mytool",
      "gen: G := npx openapi-typescript",
      "gen: X := lib",
      "gen: ; @echo lib",
      "lib:",
      `\t${use("G")} a.yaml -it`,
    );

    expect(migrated(text)).toMatchObject({
      text: text.replace("npx openapi-typescript", "npx openapi-typesafe"),
      manualSteps: [],
    });
  });

  it("migrateMakefile reads an inline recipe in the values of its targets", () => {
    const text = lines(
      "G := mytool",
      "gen: G := npx openapi-typescript",
      `gen: ; ${use("G")} a.yaml -it`,
    );

    expect(migrated(text).text).toBe(renamed(text));
  });

  it("migrateMakefile reads a recursive target value with the values of the target", () => {
    const text = lines(
      "O := mytool",
      "gen: O := npx openapi-typescript",
      `gen: G = ${use("O")} -it`,
      "gen:",
      `\t${use("G")} a.yaml`,
    );

    expect(migrated(text).text).toBe(renamed(text));
  });
});
