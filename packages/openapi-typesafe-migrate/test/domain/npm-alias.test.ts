import { describe, expect, it } from "vitest";
import { migrateNpmSpec } from "../../src/domain/npm-alias.js";

describe("migrateNpmSpec", () => {
  it.each([
    ["npm:openapi-fetch@^0.13.0", "npm:openapi-typesafe-fetch@^1.0.0", false],
    ["npm:openapi-fetch@0.13", "npm:openapi-typesafe-fetch@~1.0.0", false],
    ["npm:openapi-fetch", "npm:openapi-typesafe-fetch", false],
    ["npm:openapi-fetch/dist/index.js", "npm:openapi-typesafe-fetch/dist/index.js", true],
    ["npm:/openapi-fetch@0.13.1/", "npm:/openapi-typesafe-fetch@1.0.0/", false],
    ["npm:openapi-typescript@7/bin/cli.js", "npm:openapi-typesafe@^1.0.0/bin/cli.js", true],
  ])("migrateNpmSpec renames %s to %s", (spec, expected, isDeep) => {
    expect(migrateNpmSpec(spec, "1.0.0")).toEqual({ spec: expected, isReported: false, isDeep });
  });

  it("migrateNpmSpec keeps and reports a tag", () => {
    expect(migrateNpmSpec("npm:openapi-fetch@beta", "1.0.0")).toEqual({
      spec: "npm:openapi-typesafe-fetch@beta",
      isReported: true,
      isDeep: false,
    });
  });

  it.each(["openapi-fetch", "npm:left-pad@1", "npm:@acme/openapi-fetch@1", "npm:@scope/x/y"])(
    "migrateNpmSpec leaves %s, which is not an npm spec of an original package",
    (spec) => {
      expect(migrateNpmSpec(spec, "1.0.0")).toBeUndefined();
    },
  );
});
