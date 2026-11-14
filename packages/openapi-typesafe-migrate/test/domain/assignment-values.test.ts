import { describe, expect, it } from "vitest";
import { migrateCommand, migrateCommandLines } from "../../src/domain/command-migration.js";
import { migrateMakefile } from "../../src/domain/makefile-migration.js";
import {
  argumentAssignments,
  assignmentValue,
  holdsCommandLine,
  shellAssignments,
} from "../../src/domain/shell-assignments.js";
import { type ShellWord, shellCommands } from "../../src/domain/shell-words.js";

const lines = (...parts: string[]): string => `${parts.join("\n")}\n`;
const shell = (name: string): string => ["$", name].join("");
const BACKSLASH = "\\";

/** The words of the value of the first assignment of `text`, placed in `text`. */
function placedWords(text: string): ShellWord[] {
  const [assignment] = shellAssignments(shellCommands(text)[0] ?? []);
  if (assignment === undefined) {
    return [];
  }
  const value = assignmentValue(assignment);
  return shellCommands(value.text).flat().map(value.place);
}

/** The words of the value of the first assignment of `text`: each value and its text as written. */
const valueWords = (text: string): string[][] =>
  placedWords(text).map(({ value, start, end }) => [value, text.slice(start, end)]);

describe("assignmentValue", () => {
  it("assignmentValue places the words of a plain or quoted value where they are written", () => {
    expect(valueWords("GEN=npx")).toEqual([["npx", "npx"]]);
    expect(valueWords(`GEN="npx a"`)).toEqual([
      ["npx", "npx"],
      ["a", "a"],
    ]);
    expect(valueWords("GEN='npx a'")).toEqual([
      ["npx", "npx"],
      ["a", "a"],
    ]);
  });

  it("assignmentValue reads a value of several parts after quote removal", () => {
    expect(valueWords(`GEN=npx${BACKSLASH} openapi-typescript`)).toEqual([
      ["npx", "npx"],
      ["openapi-typescript", "openapi-typescript"],
    ]);
    expect(valueWords(`GEN="npx "openapi-typescript`)).toEqual([
      ["npx", "npx"],
      ["openapi-typescript", "openapi-typescript"],
    ]);
    expect(valueWords(`GEN='npx'${BACKSLASH} "a"b`)).toEqual([
      ["npx", "npx"],
      ["ab", 'a"b'],
    ]);
  });

  it("assignmentValue resolves the escapes of double quotes and keeps a last backslash", () => {
    const escaped = `GEN="sh -c ${BACKSLASH}"a b${BACKSLASH}""`;
    expect(valueWords(escaped)).toEqual([
      ["sh", "sh"],
      ["-c", "-c"],
      ["a b", `"a b${BACKSLASH}"`],
      ["a", "a"],
      ["b", "b"],
    ]);
    expect(valueWords(`GEN="a${BACKSLASH}\nb"`)).toEqual([["ab", `a${BACKSLASH}\nb`]]);
    const last = `GEN=a${BACKSLASH}`;
    expect(placedWords(last).map(({ value, end }) => [value, end])).toEqual([
      [`a${BACKSLASH}`, last.length],
    ]);
  });

  it("assignmentValue reads the items of an array as written", () => {
    expect(valueWords(`GEN=(npx "a")`)).toEqual([
      ["npx", "npx"],
      ["a", '"a"'],
    ]);
  });
});

describe("argumentAssignments", () => {
  const argumentsOf = (text: string) =>
    argumentAssignments(shellCommands(text)[0] ?? []).map((found) => [
      found.name,
      found.value,
      holdsCommandLine(found),
    ]);

  it("argumentAssignments reads the assignments after a program, not before it", () => {
    expect(argumentsOf(`A=1 cross-env GEN="npx a" V=1 node gen.js`)).toEqual([
      ["GEN", "npx a", true],
      ["V", "1", false],
    ]);
    expect(argumentsOf("export GEN=a")).toEqual([]);
    expect(argumentsOf("make --x=a")).toEqual([]);
  });

  it("holdsCommandLine counts a value with a blank or a command separator", () => {
    expect(argumentsOf("make A='a;b' B='a b' C=x")).toEqual([
      ["A", "a;b", true],
      ["B", "a b", true],
      ["C", "x", false],
    ]);
  });
});

describe("migrateCommandLines and values of several parts", () => {
  it("migrateCommandLines renames an escaped value and the flags of its uses together", () => {
    const text = lines(`GEN=npx${BACKSLASH} openapi-typescript`, `${shell("GEN")} a.yaml -it`);

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toBe(
      lines(`GEN=npx${BACKSLASH} openapi-typesafe`, `${shell("GEN")} a.yaml --immutable`),
    );
    expect(migrated.manualSteps).toEqual([]);
  });

  it("migrateCommandLines renames a value of adjacent quoted parts", () => {
    const text = lines(`GEN="npx "openapi-typescript`, `${shell("GEN")} a.yaml -it`);

    expect(migrateCommandLines(text, "gen.sh").text).toBe(
      lines(`GEN="npx "openapi-typesafe`, `${shell("GEN")} a.yaml --immutable`),
    );
  });

  it("migrateCommand renames an escaped value in a package.json script", () => {
    const script = `GEN=npx${BACKSLASH} openapi-typescript; ${shell("GEN")} a.yaml -it`;

    expect(migrateCommand(script, "scripts.gen").text).toBe(
      `GEN=npx${BACKSLASH} openapi-typesafe; ${shell("GEN")} a.yaml --immutable`,
    );
  });

  it("migrateCommandLines reports a generator name that quotes split", () => {
    const text = lines(`GEN='npx '"open"api-typescript`, `${shell("GEN")} a.yaml`);

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "gen.sh:1", word: "openapi-typescript" },
    ]);
  });
});

describe("migrateCommandLines and assignments passed to a program", () => {
  it("migrateCommand renames a command line that cross-env passes as a variable", () => {
    const script = `cross-env GEN="npx openapi-typescript -it" node gen.js`;

    expect(migrateCommand(script, "scripts.gen").text).toBe(
      `cross-env GEN="npx openapi-typesafe --immutable" node gen.js`,
    );
  });

  it("migrateCommandLines renames a command line that env passes, and no shell variable", () => {
    const text = lines(`env GEN="npx openapi-typescript -it" make`, `${shell("GEN")} a.yaml -it`);

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toContain(`env GEN="npx openapi-typesafe --immutable" make`);
    expect(migrated.text).toContain(`${shell("GEN")} a.yaml -it`);
  });

  it("migrateMakefile renames a command line passed to a sub-make", () => {
    const text = lines("all:", `\t$(MAKE) -C api GEN="npx openapi-typescript -it"`);

    expect(migrateMakefile(text, "Makefile").text).toBe(
      lines("all:", `\t$(MAKE) -C api GEN="npx openapi-typesafe --immutable"`),
    );
  });

  it("migrateCommandLines reports an old name in one word passed as a variable", () => {
    const text = lines("make GEN=openapi-typescript V=1");

    const migrated = migrateCommandLines(text, "gen.sh");

    expect(migrated.text).toBe(text);
    expect(migrated.manualSteps).toEqual([
      { kind: "old-name-in-command", location: "gen.sh:1", word: "GEN=openapi-typescript" },
    ]);
  });
});
