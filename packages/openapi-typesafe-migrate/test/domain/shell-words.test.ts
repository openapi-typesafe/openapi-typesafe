import { describe, expect, it } from "vitest";
import { shellCommands } from "../../src/domain/shell-words.js";

/** The words of each command, by value. */
const values = (text: string): string[][] =>
  shellCommands(text).map((words) => words.map((word) => word.value));

describe("shellCommands", () => {
  it("shellCommands splits commands at control operators and line breaks", () => {
    expect(values("a b && c || d; e | f & g\nh (i) `j`")).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
      ["e"],
      ["f"],
      ["g"],
      ["h"],
      ["i"],
      ["j"],
    ]);
  });

  it("shellCommands joins lines continued with a backslash into one command", () => {
    expect(values("a \\\n  -b \\\r\n  c\nd")).toEqual([["a", "-b", "c"], ["d"]]);
  });

  it("shellCommands removes quotes and escapes from word values", () => {
    expect(values(`a 'b c' "d \\" \\$e \\x" f\\ g h"i"'j'`)[0]).toEqual([
      "a",
      "b c",
      'd " $e \\x',
      "f g",
      "hij",
    ]);
  });

  it("shellCommands keeps the offsets and the raw text of each word", () => {
    const [command] = shellCommands('x "y z"');

    expect(command).toEqual([
      { start: 0, end: 1, value: "x", raw: "x" },
      { start: 2, end: 7, value: "y z", raw: '"y z"' },
    ]);
  });

  it("shellCommands skips comments that start a word, and breaks words at redirections", () => {
    expect(values("a # b c\nd#e >out <in")).toEqual([["a"], ["d#e", "out", "in"]]);
  });

  it("shellCommands reads a quoted command line as commands, with offsets in the outer text", () => {
    const commands = shellCommands(`sh -c "x -y && z" 'q r'`);

    expect(commands.map((words) => words.map((word) => word.value))).toEqual([
      ["sh", "-c", "x -y && z", "q r"],
      ["x", "-y"],
      ["z"],
      ["q", "r"],
    ]);
    expect(commands[1]?.[0]).toMatchObject({ start: 7, end: 8, raw: "x" });
  });

  it("shellCommands does not read a word as a command line unless it is one quoted string", () => {
    expect(values(`a"b c" "d e`)).toEqual([["ab c", "d e"]]);
  });

  it("shellCommands joins a line continued inside double quotes, and ends a last comment", () => {
    expect(values('a "b\\\nc" # end')).toEqual([["a", "bc"]]);
  });

  it("shellCommands reads unclosed quotes and a trailing backslash to the end", () => {
    expect(values("a 'b c")).toEqual([["a", "b c"]]);
    expect(values("a \\")).toEqual([["a", "\\"]]);
    expect(values("")).toEqual([]);
  });
});
