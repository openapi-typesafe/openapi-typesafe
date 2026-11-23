import { describe, expect, it } from "vitest";
import { parseSettings } from "../../src/cli/settings.ts";

describe("parseSettings", () => {
  it("parseSettings without options returns five runs, one warm-up and the harness paths", () => {
    expect(parseSettings([])).toEqual({
      measuredRuns: 5,
      warmupRuns: 1,
      documentsDir: "../compat-harness/.cache/compat/documents",
      candidateCli: "../../packages/openapi-typesafe/bin/cli.js",
      baselineCli:
        "../compat-harness/.cache/compat/generators/upstream-7.13.0/node_modules/openapi-typescript/bin/cli.js",
    });
  });

  it("parseSettings with every option returns the given values", () => {
    const settings = parseSettings([
      "--runs",
      "9",
      "--warmups",
      "0",
      "--documents-dir",
      "docs",
      "--candidate-cli",
      "new.js",
      "--baseline-cli",
      "old.js",
    ]);

    expect(settings).toEqual({
      measuredRuns: 9,
      warmupRuns: 0,
      documentsDir: "docs",
      candidateCli: "new.js",
      baselineCli: "old.js",
    });
  });

  it.each([["0"], ["-1"], ["2.5"], ["five"], [""]])(
    "parseSettings with --runs %j throws",
    (runs) => {
      expect(() => parseSettings([`--runs=${runs}`])).toThrow(/--runs must be a whole number/);
    },
  );

  it("parseSettings with a negative warm-up count throws", () => {
    expect(() => parseSettings(["--warmups=-1"])).toThrow(/--warmups must be/);
  });

  it("parseSettings with an unknown option throws", () => {
    expect(() => parseSettings(["--iterations", "3"])).toThrow();
  });
});
