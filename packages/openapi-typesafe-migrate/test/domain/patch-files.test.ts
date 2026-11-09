import { describe, expect, it } from "vitest";
import { oldPackagePatchSteps, patchedOldPackage } from "../../src/domain/patch-files.js";

describe("patchedOldPackage", () => {
  it.each([
    ["openapi-fetch+0.13.0.patch", "openapi-fetch"],
    ["openapi-fetch+0.13.0+001+fix.patch", "openapi-fetch"],
    ["openapi-fetch+0.13.0.dev.patch", "openapi-fetch"],
    ["swr-openapi++openapi-typescript-helpers+0.0.15.patch", "openapi-typescript-helpers"],
    ["openapi-react-query@0.3.0.patch", "openapi-react-query"],
    ["openapi-typescript-npm-7.4.0-0c3a2f.patch", "openapi-typescript"],
  ])("patchedOldPackage finds %s a patch of %s", (fileName, name) => {
    expect(patchedOldPackage(fileName)).toBe(name);
  });

  it.each([
    "openapi-fetch@0.13.0.md",
    "left-pad+1.0.0.patch",
    "openapi-fetch++left-pad+1.0.0.patch",
    "openapi-typesafe-fetch+1.0.0.patch",
    "openapi-fetcher+1.0.0.patch",
  ])("patchedOldPackage finds %s no patch of an old package", (fileName) => {
    expect(patchedOldPackage(fileName)).toBeUndefined();
  });
});

describe("oldPackagePatchSteps", () => {
  it("oldPackagePatchSteps reports a patch of an old package with its successor", () => {
    expect(oldPackagePatchSteps("openapi-fetch+0.13.0.patch")).toEqual([
      { kind: "old-package-patch", name: "openapi-fetch", to: "openapi-typesafe-fetch" },
    ]);
    expect(oldPackagePatchSteps("left-pad+1.0.0.patch")).toEqual([]);
  });
});
