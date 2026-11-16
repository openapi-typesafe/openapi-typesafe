import { describe, expect, it } from "vitest";
import type { CalledMakefiles } from "../../src/domain/make-calls.js";
import { commandLineReplacements, migrateMakefile } from "../../src/domain/makefile-migration.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The text `$(name)` of a make reference. */
const use = (name: string): string => ["$(", name, ")"].join("");

/** The Makefiles of a project by path, each with the names it replaces by `override`. */
const calledFiles = (files: Readonly<Record<string, readonly string[]>>): CalledMakefiles => ({
  replacedNames: (path) => {
    const names = files[path];
    return names === undefined ? undefined : new Set(names);
  },
  includedText: () => undefined,
});

const PROJECT = calledFiles({
  "api/Makefile": [],
  "web/Makefile": ["GEN"],
  "lib/GNUmakefile": [],
  "lib/makefile": ["GEN"],
  "gen.mk": [],
  "api/-Cmk": [],
  "sub/api/Makefile": [],
  Makefile: [],
});

/** A step that says the old flags appended to a variable were kept. */
const keptStep = (line: number, name: string, flags: string[] = ["-it"]) => ({
  kind: "variable-not-only-generator",
  location: `sub/Makefile:${line}`,
  variable: use(name),
  flags,
});

/** A Makefile in `sub/` that exports `GEN` as the generator and runs `recipe`. */
const exporting = (recipe: string): string =>
  lines("export GEN := npx openapi-typescript", "all:", `\t${recipe}`);

const migrated = (text: string, called: CalledMakefiles = PROJECT) =>
  migrateMakefile(text, "sub/Makefile", called);

describe("migrateMakefile and the command lines of sub-makes", () => {
  it.each([
    `${use("MAKE")} -C ../api GEN+=-it`,
    `@${use("MAKE")} -C../api GEN+=-it`,
    "make --directory=../api GEN+=-it",
    "/usr/bin/gmake --directory ../lib GEN+=-it",
    `${use("MAKE")} -f ../gen.mk GEN+=-it`,
    `${use("MAKE")} -C .. -f gen.mk --file=Makefile GEN+=-it`,
    `${use("MAKE")} -C .. --makefile=gen.mk GEN+=-it`,
    `${use("MAKE")} -C .. GEN+=-it`,
    "make -C ../api -f -Cmk GEN+=-it",
  ])("migrateMakefile renames flags appended to an exported generator: %s", (recipe) => {
    const text = exporting(recipe);

    expect(migrated(text)).toMatchObject({
      text: text.replace("openapi-typescript", "openapi-typesafe").replace("-it", "--immutable"),
      manualSteps: [],
    });
  });

  it("migrateMakefile leaves text that an override of the called Makefile drops", () => {
    const text = exporting(`${use("MAKE")} -C ../web GEN+=-it`);

    expect(migrated(text)).toMatchObject({ text: text.replace("-typescript", "-typesafe") });
    expect(migrated(text).manualSteps).toEqual([]);
  });

  it.each([
    [exporting(`${use("MAKE")} -C ../missing GEN+=-it`), keptStep(3, "GEN")],
    [exporting(`${use("MAKE")} -C ${use("DIR")} GEN+=-it`), keptStep(3, "GEN")],
    [exporting(`${use("MAKE")} -C /api GEN+=-it`), keptStep(3, "GEN")],
    [exporting(`${use("MAKE")} -f ../gen.mk -f ../none.mk GEN+=-it`), keptStep(3, "GEN")],
    [
      lines("GEN := npx openapi-typescript", "all:", "\tmake -C ../api GEN+=-it"),
      keptStep(3, "GEN"),
    ],
    [
      lines("unexport GEN", "all:", "\tmake -C ../api GEN+=--redoc"),
      keptStep(3, "GEN", ["--redoc"]),
    ],
  ])("migrateMakefile reports text appended to a value it cannot follow", (text, step) => {
    expect(migrated(text)).toMatchObject({ manualSteps: [step] });
  });

  it.each([
    lines("export GEN", "GEN := npx openapi-typescript", "all:", "\tmake -C ../api GEN+=-it"),
    lines(
      ".EXPORT_ALL_VARIABLES:",
      "GEN = npx openapi-typescript",
      "all:",
      "\tmake -C ../api GEN+=-it",
    ),
    lines("export", "GEN = npx openapi-typescript", "all:", "\tmake -C ../api GEN+=-it"),
  ])("migrateMakefile reads the variables that export lines give a sub-make", (text) => {
    expect(migrated(text).text).toContain("GEN+=--immutable");
  });

  it("migrateMakefile reads an unexport after an export as the last word", () => {
    const text = lines(
      "export GEN := npx openapi-typescript",
      "unexport GEN",
      "all:",
      "\tmake GEN+=-it",
    );

    expect(migrated(text, calledFiles({ "sub/Makefile": [] })).manualSteps).toEqual([
      keptStep(4, "GEN"),
    ]);
  });

  it("migrateMakefile keeps text appended to an exported value of another program", () => {
    const text = lines("export GEN := mytool", "all:", "\tmake -C ../missing GEN+=-it");

    expect(migrated(text)).toEqual({ text, changes: [], manualSteps: [] });
  });

  it("migrateMakefile reads a generator command appended to an outside value where it is", () => {
    const text = lines(
      "X := openapi-typescript",
      "all:",
      '\tmake -C ../api GEN+="npx openapi-typescript -it"',
    );

    expect(migrated(text)).toMatchObject({
      text: text.replaceAll("openapi-typescript", "openapi-typesafe").replace("-it", "--immutable"),
      manualSteps: [],
    });
  });

  it("migrateMakefile leaves the assignments of other programs and other assignments", () => {
    const text = lines(
      "export GEN := npx openapi-typescript",
      "all:",
      "\techo GEN+=-it",
      "\tmake -C ../api GEN=-it GEN:=-it",
      "\tmake -C",
    );

    expect(migrated(text)).toMatchObject({
      text: text.replace("openapi-typescript", "openapi-typesafe"),
      manualSteps: [],
    });
  });
});

describe("commandLineReplacements", () => {
  it("commandLineReplacements gives the names an override sets in every branch", () => {
    const text = lines(
      "override A := npx openapi-typescript",
      "override B += -it",
      "ifdef CI",
      "override C := x",
      "endif",
      "gen: override D := x",
      "override D := y",
      "E := x",
      "override F = x",
      "override F += y",
    );

    expect([...commandLineReplacements(text, "Makefile")].sort()).toEqual(["A", "F"]);
  });
});
