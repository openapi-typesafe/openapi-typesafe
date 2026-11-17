import { describe, expect, it } from "vitest";
import { type CalledMakefiles, NO_CALLED_MAKEFILES } from "../../src/domain/make-calls.js";
import { migrateMakefile } from "../../src/domain/makefile-migration.js";
import { commandLineReplacements } from "../../src/domain/makefile-reading.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The text `$(name)` of a make reference. */
const use = (name: string): string => ["$(", name, ")"].join("");

const renamed = (text: string): string =>
  text.replaceAll("openapi-typescript", "openapi-typesafe").replaceAll("-it", "--immutable");

/** A step that says the old flags after a variable were kept. */
const keptStep = (line: number, name = "GEN") => ({
  kind: "variable-not-only-generator",
  location: `Makefile:${line}`,
  variable: use(name),
  flags: ["-it"],
});

/** The project files a Makefile can include, by path. */
const projectFiles = (files: Readonly<Record<string, string>>): CalledMakefiles => ({
  ...NO_CALLED_MAKEFILES,
  includedText: (path) => files[path],
});

const migrated = (text: string, called: CalledMakefiles = NO_CALLED_MAKEFILES) =>
  migrateMakefile(text, "Makefile", called);

describe("migrateMakefile and the lines make reads", () => {
  it("migrateMakefile keeps the flags of a program that a continued comment does not change", () => {
    const text = lines(
      "GEN = grep",
      "# old setting was \\",
      "GEN = openapi-typescript",
      "lint:",
      `\t${use("GEN")} -it todo src`,
    );

    expect(migrated(text)).toMatchObject({ text, manualSteps: [] });
  });

  it("migrateMakefile keeps the flags of a program that a define body does not set", () => {
    const text = lines(
      "GEN = grep",
      "define SCRIPT",
      "GEN = openapi-typescript",
      "endef",
      "lint:",
      `\t${use("GEN")} -it todo src`,
    );

    const result = migrated(text);

    expect(result.text).toBe(text);
    expect(result.manualSteps.map(({ kind }) => kind)).toEqual(["old-name-in-command"]);
  });

  it("migrateMakefile reads a define body as the command its variable holds", () => {
    const text = lines(
      "GEN = grep",
      "define GEN",
      "npx openapi-typescript",
      "endef",
      "gen:",
      `\t${use("GEN")} a.yaml -it`,
    );

    expect(migrated(text)).toMatchObject({ text: renamed(text), manualSteps: [] });
  });

  it("migrateMakefile reports the flags after a variable that evaluated text may set", () => {
    const text = lines(
      "GEN = grep",
      "define RULE",
      "GEN := npx openapi-typescript",
      "endef",
      "ifdef WITH_TYPES",
      `$(eval ${use("RULE")})`,
      "endif",
      "lint:",
      `\t${use("GEN")} -it todo src`,
    );

    const result = migrated(text);

    expect(result.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([keptStep(9)]);
  });

  it("migrateMakefile renames the command in the text of an eval call", () => {
    const text = lines(
      "K := $(eval X := npx openapi-typescript)",
      "all:",
      "\t$(eval Y := npx openapi-typescript)",
    );

    expect(migrated(text)).toMatchObject({ text: renamed(text), manualSteps: [] });
  });

  it("migrateMakefile reads the value of a variable an eval call names as Makefile text", () => {
    const text = lines(
      "RULE = GEN := npx openapi-typescript",
      "$(eval $(call RULE))",
      "gen:",
      `\t${use("GEN")} a.yaml -it`,
    );

    const result = migrated(text);

    expect(result.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([keptStep(4)]);
  });

  it.each([
    [
      "the targets of an assignment hold a reference",
      ["LINT = lint", "$(LINT): GEN = grep", "lint:"],
    ],
    ["the targets of a rule hold a reference", ["LINT = lint", "lint: GEN = grep", "$(LINT):"]],
    ["a prerequisite holds a reference", ["all: GEN = grep", "all: $(DEPS)", "lint:"]],
  ])("migrateMakefile reports the flags of a recipe when %s", (_case, rules) => {
    const text = lines("GEN = npx openapi-typescript", ...rules, `\t${use("GEN")} -it todo src`);

    const result = migrated(text);

    expect(result.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([keptStep(rules.length + 2)]);
  });

  it("migrateMakefile reports the flags when a target written with a reference may set the generator", () => {
    const text = lines(
      "GEN = grep",
      "TARGETS = gen",
      "$(TARGETS): GEN = npx openapi-typescript",
      "gen:",
      `\t${use("GEN")} api.yaml -it`,
    );

    const result = migrated(text);

    expect(result.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([keptStep(5)]);
  });

  it("migrateMakefile reports the flags of a program that a tab-started branch may change", () => {
    const text = lines(
      "GEN = npx openapi-typescript",
      "ifdef LINT",
      "\tGEN = grep",
      "endif",
      "lint:",
      `\t${use("GEN")} -it src`,
    );

    const result = migrated(text);

    expect(result.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([keptStep(6)]);
  });

  it("migrateMakefile renames the flags when every tab-started branch sets the generator", () => {
    const text = lines(
      "ifeq ($(OS),Windows_NT)",
      "\tGEN = npx.cmd openapi-typescript",
      "else",
      "\tGEN = npx openapi-typescript",
      "endif",
      "types:",
      `\t${use("GEN")} api.yaml -it`,
    );

    expect(migrated(text)).toMatchObject({ text: renamed(text), manualSteps: [] });
  });
});

describe("migrateMakefile and make's reading, more shapes", () => {
  it("migrateMakefile reports the text that evaluated text appends to a value", () => {
    const text = lines(
      "GEN = npx openapi-typescript",
      "define R",
      "GEN += -it",
      "endef",
      `$(eval ${use("R")})`,
      "gen:",
      `\t${use("GEN")} a.yaml`,
    );

    const result = migrated(text);

    expect(result.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([keptStep(3)]);
  });

  it("migrateMakefile reports the text that evaluated text appends for some targets", () => {
    const text = lines(
      "GEN = npx openapi-typescript",
      "define R",
      "gen: GEN += -it",
      "endef",
      `$(eval ${use("R")})`,
      "gen:",
      `\t${use("GEN")} a.yaml`,
    );

    const result = migrated(text);

    expect(result.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([keptStep(3)]);
  });

  it("migrateMakefile reports the flags when evaluated text may set a value for some targets", () => {
    const text = lines(
      "GEN = npx openapi-typescript",
      "define R",
      "gen: GEN = grep",
      "endef",
      "ifdef LINT",
      `$(eval ${use("R")})`,
      "endif",
      "gen:",
      `\t${use("GEN")} a.yaml -it`,
    );

    const result = migrated(text);

    expect(result.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([keptStep(9)]);
  });

  it("migrateMakefile renames the command of an eval call inside another function", () => {
    const text = lines("all:", "\t$(foreach t,a,$(eval Z := npx openapi-typescript))");

    expect(migrated(text)).toMatchObject({ text: renamed(text), manualSteps: [] });
  });

  it("migrateMakefile keeps a backslash before a comment that a second backslash escapes", () => {
    const text = lines(
      "GEN = grep\\\\# GEN = npx openapi-typescript",
      "lint:",
      `\t${use("GEN")} -it src`,
    );

    expect(migrated(text)).toMatchObject({ text, manualSteps: [] });
  });
});

describe("migrateMakefile and included files", () => {
  const main = lines(
    "GEN = npx openapi-typescript",
    "include tools.mk",
    "lint:",
    `\t${use("GEN")} -it todo src`,
  );

  it("migrateMakefile keeps the flags of a program that an included file sets", () => {
    const called = projectFiles({ "tools.mk": lines("GEN = grep") });

    const result = migrated(main, called);

    expect(result.text).toBe(main.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([]);
  });

  it("migrateMakefile renames the flags of the generator that an included file appends to", () => {
    const called = projectFiles({ "tools.mk": lines("GEN += --redoc r.yaml") });

    expect(migrated(main, called)).toMatchObject({ text: renamed(main), manualSteps: [] });
  });

  it("migrateMakefile reports the flags after an include of a file it cannot read", () => {
    const result = migrated(main);

    expect(result.text).toBe(main.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([keptStep(4)]);
  });

  it.each([
    ["a reference", "include $(TOOLS)"],
    ["a wildcard", "include *.mk"],
    ["one unread file of two", "include tools.mk other.mk"],
  ])("migrateMakefile reports the flags after an include with %s", (_case, include) => {
    const text = main.replace("include tools.mk", include);
    const files = {
      "tools.mk": lines("X = 1"),
      "$(TOOLS)": lines("GEN = grep"),
      "*.mk": lines("GEN = grep"),
    };

    expect(migrated(text, projectFiles(files)).manualSteps).toEqual([keptStep(4)]);
  });

  it("migrateMakefile reads a tab-started line after an include as make's", () => {
    const called = projectFiles({ "tools.mk": lines("gen:", "\t@echo gen") });
    const text = main.replace("include tools.mk", "include tools.mk\n\tGEN = grep");

    const result = migrated(text, called);

    expect(result.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([]);
  });

  it("migrateMakefile reads nested includes from the folder of the Makefile, once each", () => {
    const called = projectFiles({
      "mk/a.mk": lines("include mk/b.mk"),
      "mk/b.mk": lines("include mk/a.mk", "GEN = grep"),
    });
    const text = main.replace("include tools.mk", "include mk/a.mk");

    const result = migrated(text, called);

    expect(result.text).toBe(text.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([]);
  });

  it("migrateMakefile leaves the text of an included file to that file's own migration", () => {
    const called = projectFiles({ "tools.mk": "gen:\n\tnpx openapi-typescript a.yaml -it" });
    const text = lines(
      "include tools.mk",
      "\tGEN = x",
      "all:",
      "\tnpx openapi-typescript b.yaml -it",
    );

    const result = migrated(text, called);

    expect(result.text).toBe(renamed(text));
    expect(result.changes.map((change) => ("location" in change ? change.location : ""))).toEqual([
      "Makefile:4",
      "Makefile:4",
    ]);
  });

  it("migrateMakefile reads an include on the last line without a line break", () => {
    const called = projectFiles({ "tools.mk": "GEN = grep" });
    const text = `lint:\n\t${use("GEN")} -it src\nGEN = npx openapi-typescript\ninclude tools.mk`;

    expect(migrated(text, called)).toMatchObject({
      text: text.replace("openapi-typescript", "openapi-typesafe"),
      manualSteps: [],
    });
  });

  it("migrateMakefile reads an include from the folder of the Makefile", () => {
    const called = projectFiles({
      "api/tools.mk": lines("GEN = grep"),
      "tools.mk": lines("X = 1"),
    });

    const result = migrateMakefile(main, "api/Makefile", called);

    expect(result.text).toBe(main.replace("npx openapi-typescript", "npx openapi-typesafe"));
    expect(result.manualSteps).toEqual([]);
  });

  it("commandLineReplacements reads the overrides of an included file", () => {
    const called = projectFiles({ "tools.mk": lines("override GEN := x") });

    expect([...commandLineReplacements(lines("include tools.mk"), "Makefile", called)]).toEqual([
      "GEN",
    ]);
  });
});

/** A call of make's eval function on `argument`. */
const evaluated = (argument: string): string => ["$(", "eval ", argument, ")"].join("");

describe("migrateMakefile and the escapes in evaluated text", () => {
  it.each([
    ["a call of a template", evaluated(`$(call TPL,a)`)],
    ["a reference to a template", evaluated(use("TPL"))],
  ])("migrateMakefile reads $$(GEN) of %s as a reference to GEN", (_, call) => {
    const text = lines(
      "GEN := npx openapi-typescript",
      "define TPL",
      "$(1): ; $$(GEN) $(1).yaml -it",
      "endef",
      call,
    );

    expect(migrated(text)).toEqual({
      text: renamed(text),
      changes: [
        { kind: "command-renamed", location: "Makefile:1" },
        { kind: "flag-renamed", location: "Makefile:3", from: "-it", to: "--immutable" },
      ],
      manualSteps: [],
    });
  });

  it("migrateMakefile reads $$(GEN) in the argument of an eval call as a reference", () => {
    const text = lines("GEN := npx openapi-typescript", evaluated("a: ; $$(GEN) a.yaml -it"));

    expect(migrated(text).text).toBe(renamed(text));
  });

  it("migrateMakefile keeps the escape of a template that eval gets by its value", () => {
    const text = lines(
      "GEN := npx openapi-typescript",
      "define TPL",
      "a: ; $$(GEN) a.yaml -it",
      "endef",
      evaluated("$(value TPL)"),
    );

    expect(migrated(text).text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
  });

  it("migrateMakefile reads $$$$GEN of a template as the recipe's $$GEN", () => {
    const shellGen = 'GEN="npx openapi-typescript";';
    const template = lines("define TPL", `a: ; ${shellGen} $$$$GEN a.yaml -it`, "endef");
    const text = lines(template.trimEnd(), evaluated("$(call TPL,a)"));
    const recipe = lines("", `a: ; ${shellGen} $$GEN a.yaml -it`);

    const found = migrated(text);

    expect(found.text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
    expect(found.manualSteps).toEqual(migrated(recipe).manualSteps);
  });

  it("migrateMakefile reads $$$$(GEN) in an eval argument as the shell's $(GEN)", () => {
    const text = lines("GEN := npx openapi-typescript", evaluated("a: ; $$$$(GEN) a.yaml -it"));

    expect(migrated(text).text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
  });

  it.each([
    ["an eval argument", evaluated("a: ; $$$(GEN) a.yaml -it")],
    [
      "a template",
      lines("define TPL", "a: ; echo $$$$$$(GEN) a.yaml -it", "endef", "$(eval $(TPL))"),
    ],
  ])("migrateMakefile reads an odd run of $ in %s as $ before a reference", (_, evaluation) => {
    const text = lines("GEN := npx openapi-typescript", evaluation.trimEnd());

    expect(migrated(text).text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
  });

  it("migrateMakefile keeps the escape of a recipe that no eval reads", () => {
    const text = lines("GEN := npx openapi-typescript", "a:", "\t$$(GEN) a.yaml -it");

    expect(migrated(text).text).toBe(text.replace("openapi-typescript", "openapi-typesafe"));
  });
});
