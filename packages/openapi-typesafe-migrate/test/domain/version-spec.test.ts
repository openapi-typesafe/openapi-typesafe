import { describe, expect, it } from "vitest";
import { migrateVersionSpec } from "../../src/domain/version-spec.js";

describe("migrateVersionSpec", () => {
  it.each([
    ["^7.13.0", "^1.2.0"],
    ["~0.13.1", "~1.2.0"],
    ["7.13.0", "1.2.0"],
    [">=7", "^1.2.0"],
  ])("migrateVersionSpec replaces %s with %s", (spec, expected) => {
    expect(migrateVersionSpec(spec, "1.2.0")).toEqual({ kind: "replaced", spec: expected });
  });

  it.each(["catalog:", "catalog:api", "workspace:*"])(
    "migrateVersionSpec keeps %s silently",
    (spec) => {
      expect(migrateVersionSpec(spec, "1.2.0")).toEqual({ kind: "kept", spec, isReported: false });
    },
  );

  it.each(["latest", "npm:other@1", "file:../x.tgz", "github:a/b"])(
    "migrateVersionSpec keeps and reports %s",
    (spec) => {
      expect(migrateVersionSpec(spec, "1.2.0")).toEqual({ kind: "kept", spec, isReported: true });
    },
  );
});
