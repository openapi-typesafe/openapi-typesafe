import { describe, expect, it } from "vitest";
import { migrateVersionSpec } from "../../src/domain/version-spec.js";

describe("migrateVersionSpec", () => {
  it.each([
    ["^7.13.0", "^1.2.0"],
    ["~0.13.1", "~1.2.0"],
    ["~>0.13.1", "~1.2.0"],
    ["7.13.0", "1.2.0"],
    ["=7.13.0", "1.2.0"],
    ["v7.13.0", "1.2.0"],
    ["7.13.0-beta.1", "1.2.0"],
    [">=7", "^1.2.0"],
    [">= 7.0.0", "^1.2.0"],
    [">0.13", "^1.2.0"],
  ])("migrateVersionSpec keeps the operator style of %s: %s", (spec, expected) => {
    expect(migrateVersionSpec(spec, "1.2.0")).toEqual({ kind: "replaced", spec: expected });
  });

  it.each([
    ["7", "^1.2.0"],
    ["7.x", "^1.2.0"],
    ["0.x", "^1.2.0"],
    ["7.*.*", "^1.2.0"],
    ["0.13", "~1.2.0"],
    ["0.13.x", "~1.2.0"],
    ["0.13.*", "~1.2.0"],
  ])("migrateVersionSpec keeps what the partial version %s fixes: %s", (spec, expected) => {
    expect(migrateVersionSpec(spec, "1.2.0")).toEqual({ kind: "replaced", spec: expected });
  });

  it.each([
    [">=0.13.0 <0.18.0", "^1.2.0"],
    ["^7 || ^8", "^1.2.0"],
    ["^0.13.0 || ^0.17.0", "^1.2.0"],
    ["~0.13.0 || ^0.17.0", "~1.2.0"],
    ["7.0.0 - 8.0.0", "^1.2.0"],
    [">=7.0.0 <8", "^1.2.0"],
  ])(
    "migrateVersionSpec gives the range %s the style of its first comparator: %s",
    (spec, expected) => {
      expect(migrateVersionSpec(spec, "1.2.0")).toEqual({ kind: "replaced", spec: expected });
    },
  );

  it.each(["catalog:", "catalog:api", "workspace:*"])(
    "migrateVersionSpec keeps %s silently",
    (spec) => {
      expect(migrateVersionSpec(spec, "1.2.0")).toEqual({ kind: "kept", spec, isReported: false });
    },
  );

  it.each([
    "latest",
    "",
    "*",
    "x",
    "<8",
    "<=0.17.0",
    "^7 || latest",
    "^7.13.0abc",
    "npm:other@1",
    "file:../x.tgz",
    "github:a/b",
  ])("migrateVersionSpec keeps and reports %j", (spec) => {
    expect(migrateVersionSpec(spec, "1.2.0")).toEqual({ kind: "kept", spec, isReported: true });
  });
});
