import {
  CatalogEntries,
  type CatalogPlan,
  catalogOfSpec,
  DEFAULT_CATALOG,
} from "./catalog-plan.js";
import { isMap, mapsAt, type TreeMap, textEntries } from "./config-documents.js";
import {
  CATALOG_FIELD,
  DEPENDENCY_FIELDS,
  NAMED_CATALOGS_FIELD,
  PACKAGE_RENAMES,
  WORKSPACES_FIELD,
} from "./package-names.js";
import { specEntries } from "./tree-entries.js";

/**
 * Catalogs and the dependencies that point at them (`"openapi-fetch": "catalog:"`). A catalog
 * entry and the dependencies on it must keep the same name, or the install fails
 * (`ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`). The files are migrated one by one, so this plan
 * is made from all of them first: an entry keeps its old name while a dependency keeps using it,
 * and a dependency keeps its old name while its entry stays.
 */

const PATH_SEPARATOR = ".";

/** One catalog map: its name as `catalog:<name>` names it, and where it is in the file. */
export interface CatalogMap {
  readonly name: string;
  readonly label: string;
  readonly map: TreeMap;
}

/**
 * The catalogs of a file: `catalog` (the default one) and `catalogs.<name>`, as pnpm and Yarn
 * read them, and also under `workspaces` as bun reads them. `prefix` names where `root` is.
 */
export function catalogMaps(root: TreeMap, prefix = ""): CatalogMap[] {
  const maps = mapsAt(root, CATALOG_FIELD).map((map) => ({
    name: DEFAULT_CATALOG,
    label: `${prefix}${CATALOG_FIELD}`,
    map,
  }));
  for (const catalogs of mapsAt(root, NAMED_CATALOGS_FIELD)) {
    for (const { key, value } of textEntries(catalogs)) {
      if (isMap(value)) {
        const label = [prefix + NAMED_CATALOGS_FIELD, key.value].join(PATH_SEPARATOR);
        maps.push({ name: key.value, label, map: value });
      }
    }
  }
  return maps;
}

/** The catalogs of a manifest: at the top level and under `workspaces` (bun). */
export const manifestCatalogMaps = (manifest: TreeMap): CatalogMap[] => [
  ...catalogMaps(manifest),
  ...mapsAt(manifest, WORKSPACES_FIELD).flatMap((workspaces) =>
    catalogMaps(workspaces, `${WORKSPACES_FIELD}${PATH_SEPARATOR}`),
  ),
];

/** The documents the plan is made from: manifests, and the files that hold catalogs. */
export interface CatalogDocuments {
  readonly manifests: readonly TreeMap[];
  readonly catalogFiles: readonly TreeMap[];
}

/**
 * Dependencies on a catalog that keep the old name whatever the catalog does: their field has the
 * new name too, so the rename is left (domain/dependency-map.ts).
 */
function entriesInUse(manifests: readonly TreeMap[]): CatalogEntries {
  const inUse = new CatalogEntries();
  const fields = manifests.flatMap((manifest) =>
    DEPENDENCY_FIELDS.flatMap((field) => mapsAt(manifest, field)),
  );
  for (const dependencies of fields) {
    const entries = specEntries(dependencies);
    const names = new Set(entries.map((entry) => entry.name));
    for (const { name, spec } of entries) {
      const catalog = spec === undefined ? undefined : catalogOfSpec(spec.value);
      const to = PACKAGE_RENAMES.get(name);
      if (catalog !== undefined && to !== undefined && names.has(to)) {
        inUse.add(catalog, name);
      }
    }
  }
  return inUse;
}

/**
 * The plan for the catalogs of a project, from all its manifests and catalog files. An entry with
 * an old name stays when its value is not one the tool edits (an alias, a flow map), or when a
 * dependency keeps using it; then, unless the catalog has the new name too, the dependencies on
 * it keep the old name as well (dependency-map.ts makes both decisions by this plan).
 */
export function planCatalogs({ manifests, catalogFiles }: CatalogDocuments): CatalogPlan {
  const inUse = entriesInUse(manifests);
  const kept = new CatalogEntries();
  const catalogs = [
    ...catalogFiles.flatMap((file) => catalogMaps(file)),
    ...manifests.flatMap(manifestCatalogMaps),
  ];
  for (const { name: catalog, map } of catalogs) {
    const entries = specEntries(map);
    const names = new Set(entries.map((entry) => entry.name));
    for (const { name, spec } of entries) {
      const to = PACKAGE_RENAMES.get(name);
      const stays = spec === undefined || inUse.has(catalog, name);
      if (to !== undefined && !names.has(to) && stays) {
        kept.add(catalog, name);
      }
    }
  }
  return { inUse, kept };
}
