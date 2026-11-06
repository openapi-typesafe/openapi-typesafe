/**
 * What the migration renames (ENGINEERING_PLAN 10.1). openapi-typesafe is a drop-in successor, so
 * moving a project is a matter of names: packages, the CLI command and a few renamed CLI flags.
 */

/** Original package name → openapi-typesafe package name. */
export const PACKAGE_RENAMES: ReadonlyMap<string, string> = new Map([
  ["openapi-typescript", "openapi-typesafe"],
  ["openapi-fetch", "openapi-typesafe-fetch"],
  ["openapi-react-query", "openapi-typesafe-react-query"],
  ["openapi-typescript-helpers", "openapi-typesafe-helpers"],
]);

/** The generator's command, as package.json scripts and shell lines run it. */
export const GENERATOR_COMMAND = "openapi-typescript";
export const MIGRATED_GENERATOR_COMMAND = "openapi-typesafe";

/**
 * Flags that openapi-typescript 6 and 7 renamed; the openapi-typesafe CLI rejects the old spelling
 * with CLI_FLAG_REMOVED, so the migration writes the new one.
 */
export const FLAG_RENAMES: ReadonlyMap<string, string> = new Map([
  ["--immutable-types", "--immutable"],
  ["-it", "--immutable"],
  ["--support-array-length", "--array-length"],
  ["--redoc", "--redocly"],
  ["-ap", "--additional-properties"],
]);

/** The dependency fields of package.json that install packages, in the order npm documents them. */
export const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

export type DependencyField = (typeof DEPENDENCY_FIELDS)[number];

/** Fields that can name a package without installing it; they are reported, not rewritten. */
export const OVERRIDE_FIELDS = ["overrides", "resolutions", "pnpm"] as const;

/** An original package that another package still needs as a peer dependency. */
export interface OldPeer {
  readonly peer: string;
  readonly range: string;
}

/**
 * Packages that keep a peer dependency on an original package after the migration. swr-openapi 5
 * takes its types from openapi-fetch (`peerDependencies: { "openapi-fetch": ">=0.15" }`), so
 * openapi-fetch must stay installed for it.
 */
export const OLD_PEER_DEPENDENTS: ReadonlyMap<string, OldPeer> = new Map([
  ["swr-openapi", { peer: "openapi-fetch", range: ">=0.15" }],
]);
