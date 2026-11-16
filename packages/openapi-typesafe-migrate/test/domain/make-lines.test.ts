import { describe, expect, it } from "vitest";
import { type MakeLines, readMakeLines } from "../../src/domain/make-lines.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The names and values of the assignments of a Makefile, as make reads them. */
function assignmentsOf(text: string): Array<[string, string, string]> {
  return readMakeLines(text).assignments.map(({ name, operator, valueStart, valueEnd }) => [
    name,
    operator,
    text.slice(valueStart, valueEnd).trim(),
  ]);
}

/** The text of each recipe part of the rules of a Makefile, by the rule's targets. */
function recipesOf(text: string): Array<[string, string[]]> {
  return readMakeLines(text).rules.map(({ targets, recipes }) => [
    targets.join(" "),
    recipes.map(({ start, end }) => text.slice(start, end).trim()),
  ]);
}

/** The text of the parts of a Makefile that are make's own. */
const hiddenOf = ({ hidden }: MakeLines, text: string): string[] =>
  hidden.map(({ start, end }) => text.slice(start, end));

describe("readMakeLines", () => {
  it("readMakeLines reads a comment that a backslash continues as one comment", () => {
    const text = lines("GEN = grep", "# old setting was \\", "GEN = openapi-typescript", "X = 1");

    expect(assignmentsOf(text)).toEqual([
      ["GEN", "=", "grep"],
      ["X", "=", "1"],
    ]);
  });

  it("readMakeLines ends a value at its comment, also one a backslash continues", () => {
    const text = lines("GEN = npx openapi-typescript # note \\", "GEN = grep", "Y = \\#kept");

    expect(assignmentsOf(text)).toEqual([
      ["GEN", "=", "npx openapi-typescript"],
      ["Y", "=", "\\#kept"],
    ]);
  });

  it("readMakeLines reads the body of a define as the value, not as assignments", () => {
    const text = lines("define SCRIPT", "GEN = openapi-typescript", "endef", "Z := 2");

    expect(assignmentsOf(text)).toEqual([
      ["SCRIPT", "=", "GEN = openapi-typescript"],
      ["Z", ":=", "2"],
    ]);
  });

  it.each([
    ["define GEN :=", ":="],
    ["define GEN +=", "+="],
    ["define GEN ?=", "?="],
    ["override define GEN =", "="],
    ["export define GEN", "="],
  ])("readMakeLines reads %s with its operator", (head, operator) => {
    const text = lines(head, "npx openapi-typescript", "endef");

    expect(assignmentsOf(text)).toEqual([["GEN", operator, "npx openapi-typescript"]]);
  });

  it("readMakeLines ends a define at the endef of its own level", () => {
    const text = lines("define OUTER", "define INNER", "x", "endef", "\tendef", "endef", "A = 1");

    expect(assignmentsOf(text)).toEqual([
      ["OUTER", "=", "define INNER\nx\nendef\n\tendef"],
      ["A", "=", "1"],
    ]);
  });

  it("readMakeLines does not end a define at an endef that a backslash joins to a line", () => {
    const text = lines("define X", "foo \\", "endef", "bar", "endef");

    expect(assignmentsOf(text)).toEqual([["X", "=", "foo \\\nendef\nbar"]]);
  });

  it("readMakeLines reads a define without endef to the end of the text", () => {
    const text = lines("define X", "a");

    expect(assignmentsOf(text)).toEqual([["X", "=", "a"]]);
  });

  it("readMakeLines reads the endef line of a define as make's own text", () => {
    const text = lines("define X", "a", "endef # done");

    expect(hiddenOf(readMakeLines(text), text)).toEqual(["endef # done"]);
  });

  it("readMakeLines reads an empty define as an empty value", () => {
    const text = lines("define X", "endef", "B = 2");

    expect(assignmentsOf(text)).toEqual([
      ["X", "=", ""],
      ["B", "=", "2"],
    ]);
  });

  it("readMakeLines reads a tab-started assignment before the first rule", () => {
    const text = lines("ifdef LINT", "\tGEN = grep", "endif", "lint:", "\t$(GEN) -it src");

    expect(assignmentsOf(text)).toEqual([["GEN", "=", "grep"]]);
    expect(recipesOf(text)).toEqual([["lint", ["$(GEN) -it src"]]]);
  });

  it.each([
    ["an assignment", "X = 1"],
    ["an assignment for targets", "gen: X = 1"],
    ["an export line", "export X"],
    ["an include", "-include x.mk"],
    ["another make line", "$(info x)"],
  ])("readMakeLines ends a rule at %s, so a tab-started line is make's", (_kind, line) => {
    const text = lines("all:", "\t@echo a", line, "\tY = 2");

    expect(assignmentsOf(text).at(-1)).toEqual(["Y", "=", "2"]);
    expect(recipesOf(text)[0]).toEqual(["all", ["@echo a"]]);
  });

  it.each([
    ["a conditional", "ifdef X"],
    ["a comment", "# note"],
    ["a blank line", ""],
  ])("readMakeLines keeps the recipe after %s", (_kind, line) => {
    const text = lines("all:", "\t@echo a", line, "\t@echo b");

    expect(recipesOf(text)).toEqual([["all", ["@echo a", "@echo b"]]]);
  });

  it("readMakeLines keeps the text a recipe line continues in the recipe", () => {
    const text = lines("all:", "\techo a \\", "GEN = x", "Y = 1");

    expect(recipesOf(text)).toEqual([["all", ["echo a \\\nGEN = x"]]]);
    expect(assignmentsOf(text)).toEqual([["Y", "=", "1"]]);
  });

  it("readMakeLines starts a new rule at the start of another file's text", () => {
    const text = lines("all:", "\t@echo a", "\tY = 2");
    const second = text.indexOf("\tY");

    const read = readMakeLines(text, { fileStarts: new Set([second]) });

    expect(read.assignments.map(({ name }) => name)).toEqual(["Y"]);
  });

  it("readMakeLines reads an inline recipe with a comment as shell text", () => {
    const text = lines("all: dep ; @echo 'x # y'", "gen: ; # only a comment", "z: a # b ; c");

    expect(recipesOf(text)).toEqual([
      ["all", ["@echo 'x # y'"]],
      ["gen", ["# only a comment"]],
      ["z", []],
    ]);
    expect(hiddenOf(readMakeLines(text), text)).toEqual(["# b ; c"]);
  });

  it("readMakeLines reads targets, prerequisites and assignments for targets", () => {
    const text = lines(
      "$(LINT_TARGETS): GEN = grep",
      "lint:: GEN = x",
      "a b &: c | d",
      "x.o: %.o: %.c $(DEPS)",
      "$(info a:b) c: d",
    );
    const read = readMakeLines(text);

    expect(read.assignments.map(({ name, targets }) => [name, targets])).toEqual([
      ["GEN", ["$(LINT_TARGETS)"]],
      ["GEN", ["lint"]],
    ]);
    expect(read.rules.map(({ targets, prerequisites }) => [targets, prerequisites])).toEqual([
      [
        ["a", "b"],
        ["c", "d"],
      ],
      [["x.o"], ["%.c", "$(DEPS)"]],
      [["$(info a:b)", "c"], ["d"]],
    ]);
  });

  it("readMakeLines reads the modifiers of an assignment", () => {
    const read = readMakeLines(lines("export override private GEN := x", "unexport A = 1"));

    expect(read.assignments[0]).toMatchObject({
      isExport: true,
      isOverride: true,
      isPrivate: true,
      isEvaluated: false,
    });
    expect(read.assignments[1]).toMatchObject({ name: "A", isExport: false });
  });

  it("readMakeLines reads undefine as an empty value", () => {
    expect(assignmentsOf(lines("undefine GEN"))).toEqual([["GEN", "=", ""]]);
  });

  it.each([
    ["GEN ::= x", "::="],
    ["GEN :::= x", ":::="],
    ["GEN != x", "!="],
    ["GEN ?= x", "?="],
    ["GEN += x", "+="],
    ["  GEN = x", "="],
    ["$(P)GEN = x", "="],
    ["ifdef = x", "="],
  ])("readMakeLines reads %s as an assignment", (line, operator) => {
    expect(assignmentsOf(lines(line)).map(([, found]) => found)).toEqual([operator]);
  });

  it.each([
    ["a rule", "gen: a=b"],
    ["a rule without blanks", "gen:a=b"],
    ["words before an operator", "a b = c"],
    ["a reference with an equals sign", "$(subst =,x,y)"],
  ])("readMakeLines does not read %s as an assignment for all targets", (_kind, line) => {
    expect(readMakeLines(lines(line)).assignments.filter(({ targets }) => !targets)).toEqual([]);
  });

  it("readMakeLines reads conditionals, exports and includes as make's own text", () => {
    const text = lines(
      "ifeq ($(A),1)",
      "else ifdef B",
      "else",
      "endif",
      "export A B",
      "unexport",
      "include a.mk $(B)",
    );
    const read = readMakeLines(text);

    expect(read.conditionals.map(({ kind }) => kind)).toEqual(["if", "else-if", "else", "endif"]);
    expect(read.exports.map(({ isExport, names }) => [isExport, names])).toEqual([
      [true, ["A", "B"]],
      [false, []],
    ]);
    expect(read.includes.map(({ paths }) => paths.map(({ text: path }) => path))).toEqual([
      ["a.mk", "$(B)"],
    ]);
    expect(hiddenOf(read, text)).toHaveLength(7);
  });

  it("readMakeLines reads a tab-started conditional in a recipe as shell text", () => {
    const read = readMakeLines(lines("all:", "\tifeq x"));

    expect(read.conditionals).toEqual([]);
  });

  it("readMakeLines marks the assignments of evaluated text", () => {
    const text = lines("A = 1", "B = 2");

    const read = readMakeLines(text, { from: text.indexOf("B"), isEvaluated: true });

    expect(read.assignments.map(({ name, isEvaluated }) => [name, isEvaluated])).toEqual([
      ["B", true],
    ]);
  });
});
