import { describe, expect, it } from "vitest";
import { ownerKey, unreadableConfig } from "../../src/domain/config-documents.js";

describe("ownerKey", () => {
  it.each([
    [["run"], "run"],
    [["jobs", "gen", "steps", 0, "run"], "run"],
    [["script", 0], "script"],
    [["script", 1, 0], "script"],
    [[0, 1], undefined],
    [[], undefined],
  ])("ownerKey of %j is %s", (path, key) => {
    expect(ownerKey(path)).toBe(key);
  });
});

describe("unreadableConfig", () => {
  it("unreadableConfig reports a config that names an original package", () => {
    expect(unreadableConfig("{\n openapi-typescript", 3)).toEqual({
      text: "{\n openapi-typescript",
      changes: [],
      manualSteps: [{ kind: "config-unreadable", position: { line: 2, column: 2 } }],
    });
  });

  it("unreadableConfig reports a config without a place when the parser gives none", () => {
    expect(unreadableConfig("openapi-fetch", undefined).manualSteps).toEqual([
      { kind: "config-unreadable", position: undefined },
    ]);
  });

  it("unreadableConfig leaves a config that names no original package", () => {
    expect(unreadableConfig("{ broken", 2)).toEqual({
      text: "{ broken",
      changes: [],
      manualSteps: [],
    });
  });
});
