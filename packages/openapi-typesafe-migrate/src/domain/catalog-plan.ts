/**
 * What the catalogs of a project keep under the old names (domain/catalogs.ts makes the plan).
 * It is apart from the catalogs so that dependency-map.ts can read a plan without importing the
 * catalog readers, which import it.
 */

const CATALOG_PROTOCOL = "catalog:";
/** The name that `catalog:` gives the default catalog. */
export const DEFAULT_CATALOG = "default";

/** The catalog that a spec points at (`catalog:` is the default one), or undefined. */
export function catalogOfSpec(spec: string): string | undefined {
  if (!spec.startsWith(CATALOG_PROTOCOL)) {
    return undefined;
  }
  return spec.slice(CATALOG_PROTOCOL.length) || DEFAULT_CATALOG;
}

/** Entries of catalogs, by catalog and package name. */
export class CatalogEntries {
  readonly #keys = new Set<string>();

  add(catalog: string, name: string): void {
    this.#keys.add(JSON.stringify([catalog, name]));
  }

  has(catalog: string, name: string): boolean {
    return this.#keys.has(JSON.stringify([catalog, name]));
  }
}

/** What the catalogs of a project keep under the old names. */
export interface CatalogPlan {
  /** Entries that a dependency keeps using under the old name: they are not renamed. */
  readonly inUse: CatalogEntries;
  /** Entries that keep the old name, with no entry for the new one: a dependency stays. */
  readonly kept: CatalogEntries;
  /**
   * The entries of the project's catalogs. A dependency on an entry that is not among them points
   * at a catalog outside the root (`--root packages/api` of a pnpm workspace): that entry cannot
   * be renamed, so the dependency keeps its name.
   */
  readonly defined: CatalogEntries;
}

/** The plan for files with no dependencies on catalogs (import maps): nothing is kept. */
export const NO_CATALOG_PLAN: CatalogPlan = {
  inUse: new CatalogEntries(),
  kept: new CatalogEntries(),
  defined: new CatalogEntries(),
};
