import { PACKAGE_RENAMES } from "./package-names.js";

/**
 * Override, resolution and patch keys name a package with a path or a version around it:
 * `app>openapi-fetch` (pnpm), `**\/openapi-fetch` (Yarn), `openapi-fetch@0.13` (pnpm, npm).
 * Matching the name as a substring took `openapi-typescript-helpers` for `openapi-typescript` too.
 */

const PARENT_SEPARATOR = ">";
const PATH_SEPARATOR = "/";
const SCOPE_PREFIX = "@";

/** The package a key targets: the last parent and path segment, without a version. */
export function overrideTarget(key: string): string {
  const child = key.split(PARENT_SEPARATOR).at(-1) ?? key;
  const segments = child.split(PATH_SEPARATOR);
  const isScoped = segments.length > 1 && segments.at(-2)?.startsWith(SCOPE_PREFIX) === true;
  const name = isScoped ? segments.slice(-2).join(PATH_SEPARATOR) : (segments.at(-1) ?? child);
  const versionAt = name.indexOf(SCOPE_PREFIX, 1);
  return versionAt === -1 ? name : name.slice(0, versionAt);
}

/** The original packages that `keys` target; each once, in key order. */
export function overriddenPackages(keys: readonly string[]): string[] {
  const targets = keys.map(overrideTarget);
  return [...new Set(targets.filter((target) => PACKAGE_RENAMES.has(target)))];
}
