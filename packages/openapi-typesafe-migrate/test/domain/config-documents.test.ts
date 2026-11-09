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
    expect(unreadableConfig("{ openapi-typescript")).toEqual({
      text: "{ openapi-typescript",
      changes: [],
      manualSteps: [{ kind: "config-unreadable" }],
    });
  });

  it("unreadableConfig leaves a config that names no original package", () => {
    expect(unreadableConfig("{ broken")).toEqual({
      text: "{ broken",
      changes: [],
      manualSteps: [],
    });
  });
});
