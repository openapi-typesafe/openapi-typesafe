import { type DocumentRead, isMap, isScalar, type TreeMap, valuesAt } from "./config-documents.js";
import type { ManualStep } from "./migration-findings.js";

/**
 * A Deno config can keep its import map in another file and name it: `"importMap":
 * "./deps.json"`. Deno resolves the name against the folder of the config. A file in the project
 * is migrated as an import map; one the tool cannot edit (a URL, a path outside the project) is
 * reported, since the sources it maps get the new names.
 */

const IMPORT_MAP_FIELD = "importMap";
const SEPARATOR = "/";
const CURRENT_FOLDER = ".";
const PARENT_FOLDER = "..";
// A URL scheme (`https:`, `file:`): Deno fetches or reads such a map from where it says.
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/** Where the import map that a config names is, for a config at a project-relative path. */
export type ImportMapLocation =
  | { readonly kind: "in-project"; readonly path: string }
  | { readonly kind: "not-editable"; readonly reference: string };

/** The `importMap` values of a config's roots, in order. */
function importMapReferences(roots: readonly TreeMap[]): string[] {
  return roots
    .flatMap((root) => valuesAt(root, IMPORT_MAP_FIELD))
    .flatMap((value) => (isScalar(value) ? [value.value] : []));
}

/** The project-relative path of `reference` from the folder of `configPath`, or undefined. */
function resolvedPath(configPath: string, reference: string): string | undefined {
  const parts = configPath.split(SEPARATOR).slice(0, -1);
  for (const part of reference.split(SEPARATOR)) {
    if (part === PARENT_FOLDER) {
      if (parts.pop() === undefined) {
        return undefined;
      }
    } else if (part !== CURRENT_FOLDER && part !== "") {
      parts.push(part);
    }
  }
  return parts.join(SEPARATOR);
}

export function importMapLocation(configPath: string, reference: string): ImportMapLocation {
  const isOutside = URL_SCHEME.test(reference) || reference.startsWith(SEPARATOR);
  const path = isOutside ? undefined : resolvedPath(configPath, reference);
  return path === undefined || path === ""
    ? { kind: "not-editable", reference }
    : { kind: "in-project", path };
}

/** The import maps that the config at `configPath` names, read as `roots`. */
export const importMapLocations = (
  configPath: string,
  roots: readonly TreeMap[],
): ImportMapLocation[] =>
  importMapReferences(roots).map((reference) => importMapLocation(configPath, reference));

/** The manual steps for the import maps of a config that the tool cannot edit. */
export function importMapSteps(configPath: string, read: DocumentRead): ManualStep[] {
  const roots = read.kind === "read" ? read.documents.filter(isMap) : [];
  return importMapLocations(configPath, roots).flatMap((location) =>
    location.kind === "not-editable"
      ? [{ kind: "import-map-not-editable" as const, reference: location.reference }]
      : [],
  );
}
