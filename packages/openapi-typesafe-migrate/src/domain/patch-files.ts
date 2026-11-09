import type { ManualStep } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";

/**
 * Patches to the code of an installed package, by the file names their tools give them:
 * patch-package `openapi-fetch+0.13.0.patch` (`parent++openapi-fetch+0.13.0.patch` for a nested
 * one), pnpm `openapi-fetch@0.13.0.patch`, Yarn `openapi-fetch-npm-0.13.0-<hash>.patch`. The new
 * package has other code, so a patch to an old one cannot be carried over: it is reported.
 */

const PATCH_EXTENSION = ".patch";
const NESTED_SEPARATOR = "++";
/** What follows the package name in each tool's file name. */
const NAME_ENDS = ["+", "@", "-npm-"] as const;

/** The old package that a patch file patches, by its file name, or undefined. */
export function patchedOldPackage(fileName: string): string | undefined {
  if (!fileName.endsWith(PATCH_EXTENSION)) {
    return undefined;
  }
  const innermost = fileName.split(NESTED_SEPARATOR).at(-1) ?? fileName;
  return [...PACKAGE_RENAMES.keys()].find((name) =>
    NAME_ENDS.some((end) => innermost.startsWith(`${name}${end}`)),
  );
}

/** The manual step for a patch file of an old package. */
export function oldPackagePatchSteps(fileName: string): ManualStep[] {
  const name = patchedOldPackage(fileName);
  const to = name === undefined ? undefined : PACKAGE_RENAMES.get(name);
  return name === undefined || to === undefined ? [] : [{ kind: "old-package-patch", name, to }];
}
