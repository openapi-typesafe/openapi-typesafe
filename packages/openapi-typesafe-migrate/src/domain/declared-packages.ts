import { mapsAt, type TreeMap, textEntries } from "./config-documents.js";
import type { Change, ManualStep } from "./migration-findings.js";
import { DEPENDENCY_FIELDS, PACKAGE_RENAMES } from "./package-names.js";

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
const packageOfSpecifier = (specifier: string): string => {
  const slash = specifier.indexOf(PATH_SEPARATOR);
  return slash === -1 ? specifier : specifier.slice(0, slash);
};

/**
 * The imports that a source file got renamed to a package that no manifest above it declares and
 * that the original packages no longer install. A Deno `npm:` specifier installs its package
 * itself and is not a package name, so it is never reported.
 */
export function undeclaredImportSteps(
  changes: readonly Change[],
  filePath: string,
  manifests: readonly ManifestDeclarations[],
): ManualStep[] {
  return changes.flatMap((change) => {
    if (change.kind !== "specifier-renamed") {
      return [];
    }
    const name = packageOfSpecifier(change.to);
    const installers = NO_LONGER_INSTALLED.get(name);
    return installers === undefined || isDeclaredFor(manifests, filePath, name)
      ? []
      : [{ kind: "package-not-declared", line: change.line, name, installers } as const];
  });
}
