import { describe, expect, it } from "vitest";
import { parseSettings } from "../../src/cli/settings.ts";

describe("parseSettings", () => {
  it("parseSettings without options selects every version and the default log directory", () => {
    expect(parseSettings([])).toEqual({ typescriptIds: [], logDir: "../../.logs/type-matrix" });
  });

  it("parseSettings collects repeated --typescript options and --log-dir", () => {
    const settings = parseSettings([
      "--typescript",
      "5.4",
      "--typescript",
      "7.0",
      "--log-dir",
      "x",
    ]);

    expect(settings).toEqual({ typescriptIds: ["5.4", "7.0"], logDir: "x" });
  });

  it("parseSettings with an unknown option throws", () => {
    expect(() => parseSettings(["--unknown"])).toThrow();
  });
});
