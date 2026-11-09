import { describe, expect, it } from "vitest";
import { type ProgramDefinition, variablePrograms } from "../../src/domain/variable-programs.js";

const generator = (name: string): ProgramDefinition => ({
  name,
  kind: "command",
  runsGenerator: true,
});
const other = (name: string): ProgramDefinition => ({
  name,
  kind: "command",
  runsGenerator: false,
});
const reference = (name: string, target: string): ProgramDefinition => ({
  name,
  kind: "reference",
  target,
});

describe("variablePrograms", () => {
  it("variablePrograms gives generator only when every definition runs it", () => {
    const programs = variablePrograms([generator("GEN"), generator("GEN"), other("TOOL")]);

    expect(Object.fromEntries(programs)).toEqual({ GEN: "generator", TOOL: "other" });
  });

  it("variablePrograms gives generator-or-other when definitions disagree", () => {
    const programs = variablePrograms([generator("GEN"), other("GEN")]);

    expect(programs.get("GEN")).toBe("generator-or-other");
  });

  it("variablePrograms follows references in any order and keeps an appending definition", () => {
    const programs = variablePrograms([
      reference("GEN", "MID"),
      reference("MID", "OAT"),
      generator("OAT"),
      { name: "GEN", kind: "append" },
      reference("SELF", "SELF"),
      generator("SELF"),
    ]);

    expect(Object.fromEntries(programs)).toEqual({
      GEN: "generator",
      MID: "generator",
      OAT: "generator",
      SELF: "generator",
    });
  });

  it("variablePrograms reads a reference to a variable the file never sets as another program", () => {
    const programs = variablePrograms([generator("GEN"), reference("GEN", "FROM_ENVIRONMENT")]);

    expect(programs.get("GEN")).toBe("generator-or-other");
  });

  it("variablePrograms passes on another program through a reference", () => {
    const programs = variablePrograms([
      generator("OAT"),
      other("OAT"),
      reference("GEN", "OAT"),
      reference("LOOP_A", "LOOP_B"),
      reference("LOOP_B", "LOOP_A"),
    ]);

    expect(programs.get("GEN")).toBe("generator-or-other");
    expect(programs.get("LOOP_A")).toBe("other");
  });
});
