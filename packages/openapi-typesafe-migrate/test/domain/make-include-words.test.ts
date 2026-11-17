import { describe, expect, it } from "vitest";
import { includeValues } from "../../src/domain/make-include-values.js";
import { includedProjectPaths } from "../../src/domain/make-include-words.js";
import { readMakeLines } from "../../src/domain/make-lines.js";
import { expandedText } from "../../src/domain/make-value-texts.js";
import { hasWildcard, wildcardPaths } from "../../src/domain/make-wildcards.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;

/** The text `$(name)` of a make reference. */
const use = (name: string): string => ["$(", name, ")"].join("");

/** The text of each variable at the end of a Makefile, as an include line reads it. */
const textsOf = (text: string) => includeValues()({ text, fileStarts: new Set() });

describe("wildcardPaths", () => {
  const listed = [
    "mk/b.mk",
    "mk/a.mk",
    "mk/.hidden.mk",
    "mk/sub/c.mk",
    "mk/B.mk",
    "x.mk",
    "mk/é.mk",
  ];

  it.each([
    ["mk/*.mk", ["mk/B.mk", "mk/a.mk", "mk/b.mk", "mk/é.mk"]],
    ["mk/?.mk", ["mk/B.mk", "mk/a.mk", "mk/b.mk", "mk/é.mk"]],
    ["mk/[ab].mk", ["mk/a.mk", "mk/b.mk"]],
    ["mk/[!ab].mk", ["mk/B.mk", "mk/é.mk"]],
    ["mk/[^a-z].mk", ["mk/B.mk", "mk/é.mk"]],
    ["mk/[]a].mk", ["mk/a.mk"]],
    ["mk/.*.mk", ["mk/.hidden.mk"]],
    ["*/*.mk", ["mk/B.mk", "mk/a.mk", "mk/b.mk", "mk/é.mk"]],
    ["mk/*/*.mk", ["mk/sub/c.mk"]],
    ["mk/\\*.mk", ["mk/\\*.mk"]],
    ["mk/[a.mk", ["mk/[a.mk"]],
    ["mk[/]a.mk", ["mk[/]a.mk"]],
    ["none/*.mk", ["none/*.mk"]],
  ])("wildcardPaths matches %s as make's glob does", (pattern, paths) => {
    expect(wildcardPaths(pattern, listed)).toEqual(paths);
  });

  it.each([
    ["mk/[]x].mk", ["mk/].mk"], ["mk/].mk"]],
    ["mk/[a.mk", ["mk/a"], ["mk/[a.mk"]],
    ["mk/\\*.mk", ["mk/*.mk", "mk/a.mk"], ["mk/*.mk"]],
    ["mk?a.mk", ["mk/a.mk"], ["mk?a.mk"]],
  ])("wildcardPaths matches %s in %j as glob does", (pattern, files, paths) => {
    expect(wildcardPaths(pattern, files)).toEqual(paths);
  });

  it.each([
    ["mk/*.mk", true],
    ["mk/a?.mk", true],
    ["mk/[ab].mk", true],
    ["mk/\\*.mk", false],
    ["mk/a.mk", false],
  ])("hasWildcard tells whether %s holds a wildcard", (word, isWildcard) => {
    expect(hasWildcard(word)).toBe(isWildcard);
  });
});

describe("expandedText and includeValues", () => {
  it.each([
    ["a simple value", lines("D := mk"), "mk"],
    ["a recursive value of a later one", lines("D = $(R)/mk", "R = ."), "./mk"],
    ["a simple value of an earlier one", lines("R := a", "D := $(R)/mk", "R := b"), "a/mk"],
    ["an appended value", lines("D := a.mk", "D += b.mk"), "a.mk b.mk"],
    ["a value continued by a backslash", lines("D := a.mk \\", "  b.mk"), "a.mk b.mk"],
    ["an escaped dollar", lines("D := a$$b"), "a$b"],
    ["a reference in braces", lines("R := x", ["D := $", "{R}"].join("")), "x"],
    ["a value of define", lines("define D", "x.mk", "endef"), "x.mk"],
  ])("includeValues gives %s", (_, text, value) => {
    expect(textsOf(text)("D")).toBe(value);
  });

  it.each([
    ["an unset variable", lines("X := 1")],
    ["a value from the environment", lines("D ?= mk")],
    ["a branch of a conditional", lines("ifdef X", "D := a", "else", "D := b", "endif")],
    ["the output of a shell", lines("D != echo mk")],
    ["a function call", lines("D := $(dir x/y)")],
    ["a substitution", lines("R := a.c", "D := $(R:.c=.mk)")],
    ["a variable that references itself", lines("D = $(D) x")],
    ["a computed name", lines("N := R", "R := x", `D := $(${use("N")})`)],
    ["a value of eval", lines("$(eval D := mk)")],
    ["an immediate recursive value", lines("D :::= mk")],
    ["an unclosed reference", lines("R := x", "D := $(RR")],
    ["text appended to a value from outside", lines("D += mk")],
    ["a value before an include the tool cannot read", lines("D := mk", `include ${use("X")}`)],
    ["a value that eval sets again", lines("D := mk", "$(eval D := b)")],
  ])("includeValues gives no text for %s", (_, text) => {
    expect(textsOf(text)("D")).toBeUndefined();
  });

  it("includeValues reads each new part of a growing text once", () => {
    const values = includeValues();
    const first = lines("D := a", "D += b");

    values({ text: first, fileStarts: new Set() });
    const value = values({ text: `${first}${lines("X := 1")}`, fileStarts: new Set() })("D");

    expect(value).toBe("a b");
  });

  it("includeValues reads an assignment for some targets as no value of the file", () => {
    expect(textsOf(lines("D := mk", "gen: D := b"))("D")).toBe("mk");
  });

  it("expandedText keeps a text without references", () => {
    expect(expandedText("a.mk b.mk", () => undefined)).toBe("a.mk b.mk");
  });
});

describe("includedProjectPaths", () => {
  const place = (text: string, listedPaths: readonly string[] = []) => ({
    folder: "api",
    listedPaths,
    valueTexts: () => textsOf(text),
  });
  const wordsOf = (line: string) => readMakeLines(lines(line)).includes[0]?.paths ?? [];

  it("includedProjectPaths expands references, splits words and matches wildcards", () => {
    const text = lines("MKS := ../mk/*.mk b.mk");

    const paths = includedProjectPaths(
      wordsOf(`include ${use("MKS")} c.mk`),
      place(text, ["mk/a.mk"]),
    );

    expect(paths).toEqual(["mk/a.mk", "api/b.mk", "api/c.mk"]);
  });

  it.each([
    ["a reference without a known value", `include ${use("X")}/a.mk`],
    ["a path outside the project", "include ../../a.mk"],
    ["an absolute path", "include /etc/a.mk"],
  ])("includedProjectPaths knows no paths for %s", (_, line) => {
    expect(includedProjectPaths(wordsOf(line), place(""))).toBeUndefined();
  });

  it("includedProjectPaths reads the values only for a line that references one", () => {
    const failing = {
      folder: "",
      listedPaths: [],
      valueTexts: () => {
        throw new Error("read the values");
      },
    };

    expect(includedProjectPaths(wordsOf("include a.mk"), failing)).toEqual(["a.mk"]);
  });
});
