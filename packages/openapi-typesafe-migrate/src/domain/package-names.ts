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

/**
 * Whether `text` names an original package as written. Every rename and every report starts at
 * such a name, so a text without one has nothing to migrate. The generator command is one of the
 * names. A name written with escapes (`"openapi\x2dfetch"` in YAML) is not found, so a file that
 * names a package only that way is left as it is.
 */
export function namesOriginalPackage(text: string): boolean {
  return [...PACKAGE_RENAMES.keys()].some((name) => text.includes(name));
}

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

/**
 * Fields keyed by the name of a dependency: `peerDependenciesMeta` (npm, its `optional` flag),
 * `dependenciesMeta` (pnpm and Yarn). A key left with the old name loses its meaning: an optional
 * peer becomes required (finding M3).
 */
export const NAME_KEYED_FIELDS = ["peerDependenciesMeta", "dependenciesMeta"] as const;

/** Fields that list the names of dependencies to bundle (npm reads both spellings). */
export const NAME_LIST_FIELDS = ["bundleDependencies", "bundledDependencies"] as const;

/**
 * Catalogs in package.json: bun reads `catalog` and `catalogs` at the top level and under
 * `workspaces`. Their names are what `catalog:` dependencies point at.
 */
export const CATALOG_FIELD = "catalog";
export const NAMED_CATALOGS_FIELD = "catalogs";
export const WORKSPACES_FIELD = "workspaces";

/** Fields that can name a package without installing it; they are reported, not rewritten. */
export const OVERRIDE_FIELDS = ["overrides", "resolutions"] as const;

/** The pnpm settings of package.json; `pnpm.overrides` is one of them. */
export const PNPM_SETTINGS_FIELD = "pnpm";

/** An original package that another package still needs as a peer dependency. */
export interface OldPeer {
  readonly peer: string;
  readonly range: string;
}

/**
 * Packages that keep a peer dependency on an original package after the migration. swr-openapi 5
 * takes its client type from openapi-fetch (`peerDependencies: { "openapi-fetch": ">=0.15" }`).
 * TypeScript infers the paths of that generic type only from the same declaration, so the
 * project must alias openapi-fetch to openapi-typesafe-fetch (ADR-030).
 */
export const OLD_PEER_DEPENDENTS: ReadonlyMap<string, OldPeer> = new Map([
  ["swr-openapi", { peer: "openapi-fetch", range: ">=0.15" }],
]);

const PATH_SEPARATOR = "/";

/** A module specifier with the package renamed, and whether it reaches into the package. */
export interface RenamedSpecifier {
  readonly to: string;
  readonly isDeep: boolean;
}

/**
 * The new name of a whole package name, or of a name and a subpath (`openapi-fetch/x`, and the
 * `openapi-fetch/` prefix of an import map); undefined for other specifiers.
 */
export function renamedSpecifier(value: string): RenamedSpecifier | undefined {
  const slash = value.indexOf(PATH_SEPARATOR);
  const name = slash === -1 ? value : value.slice(0, slash);
  const renamed = PACKAGE_RENAMES.get(name);
  if (renamed === undefined) {
    return undefined;
  }
  const subpath = value.slice(name.length);
  return { to: `${renamed}${subpath}`, isDeep: subpath !== "" && subpath !== PATH_SEPARATOR };
}
