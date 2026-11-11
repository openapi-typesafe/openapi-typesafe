import { isScalar, mapsAt, type TreeMap, textEntries } from "./config-documents.js";
import type { ManualStep } from "./migration-findings.js";
import { DEPENDENCY_FIELDS, PACKAGE_RENAMES } from "./package-names.js";
import { isLocalPackageSpec } from "./version-spec.js";

/**
 * What the manifests of a project declare, to tell whether a source file may import a package
 * without relying on another package to install it.
 */

/**
 * One manifest of the project: its path in the listing and the names its dependency fields hold;
 * `names` is undefined when the manifest could not be read, and it then counts as declaring all.
 */
export interface ManifestDeclarations {
  readonly path: string;
  readonly names: ReadonlySet<string> | undefined;
  /** The original names it declares with a spec that points at a local package. */
  readonly localPackages?: ReadonlySet<string>;
}

/**
 * A package that an original package installed as its own dependency and its successor does not.
 * openapi-fetch and openapi-react-query depend on openapi-typescript-helpers, so code could import
 * it without a dependency of its own. openapi-typesafe-fetch declares the helper types itself and
 * the hooks name them through it, so nothing installs openapi-typesafe-helpers for such code.
 */
export const NO_LONGER_INSTALLED: ReadonlyMap<string, readonly string[]> = new Map([
  ["openapi-typesafe-helpers", ["openapi-fetch", "openapi-react-query"]],
]);

/** The original name of each successor package. */
const ORIGINAL_NAMES: ReadonlyMap<string, string> = new Map(
  [...PACKAGE_RENAMES].map(([original, successor]) => [successor, original]),
);

const PATH_SEPARATOR = "/";

/** Whether a manifest text can declare a package of NO_LONGER_INSTALLED, so it must be read. */
export function namesUninstalledPackage(text: string): boolean {
  return [...NO_LONGER_INSTALLED.keys()].some(
    (name) => text.includes(name) || text.includes(ORIGINAL_NAMES.get(name) ?? name),
  );
}

const directoryOf = (path: string): string => path.slice(0, path.lastIndexOf(PATH_SEPARATOR) + 1);

/** The names that the dependency fields of a parsed manifest hold. */
export function declaredNames(manifest: TreeMap): string[] {
  return DEPENDENCY_FIELDS.flatMap((field) => mapsAt(manifest, field))
    .flatMap(textEntries)
    .map(({ key }) => key.value);
}

/**
 * The names that a parsed manifest's dependency fields point at a local package
 * (`"openapi-fetch": "workspace:*"`): such a dependency keeps its name, so its imports do too.
 */
export function localPackageNames(manifest: TreeMap): string[] {
  return DEPENDENCY_FIELDS.flatMap((field) => mapsAt(manifest, field))
    .flatMap(textEntries)
    .flatMap(({ key, value }) =>
      isScalar(value) && isLocalPackageSpec(value.value) ? [key.value] : [],
    );
}

/**
 * The original packages that a manifest at or above `filePath` declares as local packages. Node
 * finds such a package before any other of its name, so the imports of the file mean it.
 */
export function localPackagesFor(
  manifests: readonly ManifestDeclarations[],
  filePath: string,
): ReadonlySet<string> {
  const containing = manifests.filter(({ path }) => filePath.startsWith(directoryOf(path)));
  return new Set(containing.flatMap(({ localPackages }) => [...(localPackages ?? [])]));
}

/**
 * Whether a manifest at or above `filePath` declares `name`, under its old or its new name. Node
 * looks for a package in the `node_modules` folders of every directory above the file, so a
 * dependency of a workspace root counts for its packages. A file that no manifest contains is not
 * judged: it is not part of a package (a Deno module, a loose script).
 */
function isDeclaredFor(
  manifests: readonly ManifestDeclarations[],
  filePath: string,
  name: string,
): boolean {
  const original = ORIGINAL_NAMES.get(name);
  const containing = manifests.filter(({ path }) => filePath.startsWith(directoryOf(path)));
  const declares = ({ names }: ManifestDeclarations): boolean =>
    names === undefined || names.has(name) || (original !== undefined && names.has(original));
  return containing.length === 0 || containing.some(declares);
}

/** The package that a module specifier names: `pkg` of `pkg/subpath`. */
export const packageOfSpecifier = (specifier: string): string => {
  const slash = specifier.indexOf(PATH_SEPARATOR);
  return slash === -1 ? specifier : specifier.slice(0, slash);
};

/** A module specifier of a source file, as the migration leaves it, and its line. */
export interface ImportedSpecifier {
  readonly specifier: string;
  readonly line: number;
}

/**
 * The imports of a source file, as the migration leaves them, of a package that no manifest or
 * import map at or above the file declares and that the original packages no longer install. An
 * import already renamed by an earlier run counts too, so a second run still reports it. A Deno
 * `npm:` specifier installs its package itself and is not a package name, so it is never reported.
 */
export function undeclaredImportSteps(
  imports: readonly ImportedSpecifier[],
  filePath: string,
  manifests: readonly ManifestDeclarations[],
): ManualStep[] {
  return imports.flatMap(({ specifier, line }) => {
    const name = packageOfSpecifier(specifier);
    const installers = NO_LONGER_INSTALLED.get(name);
    return installers === undefined || isDeclaredFor(manifests, filePath, name)
      ? []
      : [{ kind: "package-not-declared", line, name, installers } as const];
  });
}
