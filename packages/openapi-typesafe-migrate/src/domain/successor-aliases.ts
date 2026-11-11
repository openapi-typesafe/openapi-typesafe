import { NPM_SPECIFIER_PREFIX } from "./command-launchers.js";
import {
  documentStrings,
  mapsAt,
  type TreeMap,
  type TreeNode,
  textEntries,
} from "./config-documents.js";
import { isAtOrAbove } from "./declared-packages.js";
import { packageReference } from "./old-package-words.js";
import { overrideTarget } from "./override-targets.js";
import { OVERRIDE_FIELDS, PACKAGE_RENAMES, PNPM_SETTINGS_FIELD } from "./package-names.js";

/**
 * The override that aliases an original package to its successor
 * (`"openapi-fetch": "npm:openapi-typesafe-fetch@^1.0.0"`) is what the docs ask for when a library
 * such as swr-openapi takes its client type from the original package. It is the migration done,
 * so it is not reported, and a dependency that needs the original as its peer then needs nothing.
 */

/** The key of pnpm's overrides in the `pnpm` field of a manifest (`pnpm.overrides`). */
const PNPM_OVERRIDES = "overrides";

/** True for an override entry that points an original package at its successor. */
function isSuccessorAlias(key: string, value: TreeNode): boolean {
  const successor = PACKAGE_RENAMES.get(overrideTarget(key));
  return (
    value.kind === "scalar" &&
    value.value.startsWith(NPM_SPECIFIER_PREFIX) &&
    packageReference(value.value).name === successor
  );
}

/**
 * The original packages that an override map names, each once, in order, without the entries
 * that alias one to its successor; nested maps (npm's `"swr-openapi": { … }`) are read too.
 */
export function overriddenOldPackages(node: TreeNode): string[] {
  const names =
    node.kind === "map"
      ? textEntries(node).flatMap(({ key, value }) =>
          isSuccessorAlias(key.value, value)
            ? []
            : [overrideTarget(key.value), ...overriddenOldPackages(value)],
        )
      : documentStrings([node]).map((string) => packageReference(string.value).name);
  return [...new Set(names.filter((name) => PACKAGE_RENAMES.has(name)))];
}

/** The original packages that an override map aliases to their successors, at any depth. */
function aliasedIn(node: TreeNode): string[] {
  if (node.kind !== "map") {
    return [];
  }
  return textEntries(node).flatMap(({ key, value }) =>
    isSuccessorAlias(key.value, value) ? [overrideTarget(key.value)] : aliasedIn(value),
  );
}

/**
 * The original packages that a manifest (`overrides`, `resolutions`, `pnpm.overrides`) or a
 * `pnpm-workspace.yaml` (`overrides`) aliases to their successors.
 */
export function successorAliasedPackages(root: TreeMap): string[] {
  const fields = [...OVERRIDE_FIELDS].flatMap((field) => mapsAt(root, field));
  const pnpm = mapsAt(root, PNPM_SETTINGS_FIELD).flatMap((map) => mapsAt(map, PNPM_OVERRIDES));
  return [...new Set([...fields, ...pnpm].flatMap(aliasedIn))];
}

/** The successor aliases of one file of the project, by its path. */
export interface SuccessorAliases {
  readonly path: string;
  readonly names: ReadonlySet<string>;
}

/**
 * The original packages aliased to their successors for a manifest at `filePath`: by a file at
 * or above it, as a workspace root's overrides apply to its packages.
 */
export function aliasedPackagesFor(
  aliases: readonly SuccessorAliases[],
  filePath: string,
): ReadonlySet<string> {
  const applying = aliases.filter(({ path }) => isAtOrAbove(path, filePath));
  return new Set(applying.flatMap(({ names }) => [...names]));
}
