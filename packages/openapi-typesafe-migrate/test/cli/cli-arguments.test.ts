import { describe, expect, it } from "vitest";
import { parseCliArguments } from "../../src/cli/cli-arguments.js";

describe("parseCliArguments", () => {
  it("parseCliArguments defaults to a dry run in the current directory", () => {
    expect(parseCliArguments([])).toEqual({
      kind: "migrate",
      isWrite: false,
      root: undefined,
      logPath: undefined,
    });
  });

  it("parseCliArguments reads --write, --root and --log", () => {
    expect(parseCliArguments(["--write", "--root", "app", "--log=run.jsonl"])).toEqual({
      kind: "migrate",
      isWrite: true,
      root: "app",
      logPath: "run.jsonl",
    });
  });

  it.each([["--help"], ["-h"], ["--write", "--help"]])(
    "parseCliArguments asks for help with %s",
    (...argv) => {
      expect(parseCliArguments(argv)).toEqual({ kind: "help" });
    },
  );

  it.each([["--version"], ["-v"]])("parseCliArguments asks for the version with %s", (...argv) => {
    expect(parseCliArguments(argv)).toEqual({ kind: "version" });
  });

  it.each([["--bogus"], ["stray"]])("parseCliArguments rejects %s with a TypeError", (...argv) => {
    expect(() => parseCliArguments(argv)).toThrow(TypeError);
  });
});
