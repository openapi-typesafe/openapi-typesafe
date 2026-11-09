import { assertNever } from "./assert-never.js";
import { type CatalogPlan, catalogOfSpec } from "./catalog-plan.js";
import type { Change, ManualStep } from "./migration-findings.js";
import { migrateNpmSpec } from "./npm-alias.js";
import { PACKAGE_RENAMES, renamedSpecifier } from "./package-names.js";
import type { TextEdit } from "./text-edits.js";
import { hideUrlCredentials } from "./url-credentials.js";
import { migrateVersionSpec } from "./version-spec.js";

/**
 * Maps of package names: dependency fields and catalogs (`name: spec`), and lists or keys that
 * only name a package (`peerDependenciesMeta`, `bundleDependencies`). The file formats (JSON and
 * YAML) give their entries with edits that keep the format's quoting; the decisions are here, so
 * every format renames the same way.
 */

/** The string value of an entry, and the edit that replaces it. */
export interface SpecValue {
  readonly value: string;
  readonly replace: (spec: string) => TextEdit;
}

/** One `name: spec` entry. `spec` is undefined when the value is not a string. */
export interface SpecEntry {
  readonly name: string;
  readonly spec: SpecValue | undefined;
  readonly renameKey: (name: string) => TextEdit;
}

/** One place that only names a package: a key of a meta field, an item of a list. */
export interface NameEntry {
  readonly name: string;
  readonly rename: (name: string) => TextEdit;
}

/** The edits a file gets, and what the migration found while making them. */
export interface Findings {
  readonly edits: TextEdit[];
  readonly changes: Change[];
  readonly manualSteps: ManualStep[];
}

export const newFindings = (): Findings => ({ edits: [], changes: [], manualSteps: [] });

/**
 * A dependency field (`dependencies`, …), a catalog (`catalog`, `catalogs.legacy`, …), or an
 * import map (Deno's `imports` and `scopes`), whose keys are module specifiers: a package name, a
 * subpath of it or a prefix (`openapi-fetch/`).
 */
export type SpecMap =
  | { readonly kind: "dependencies"; readonly field: string }
  | {
      readonly kind: "catalog";
      /** Where the catalog is in its file (`catalogs.legacy`), for the report. */
      readonly catalog: string;
      /** The name that `catalog:<name>` gives it (`default` for `catalog:`). */
      readonly name: string;
    }
  | { readonly kind: "imports"; readonly field: string };

/** What renamed entries get: the version of the tool, and the plan of the project's catalogs. */
export interface RenameTarget {
  readonly version: string;
  readonly catalogs: CatalogPlan;
}

/** Where a map is, the version renamed entries get, and where the findings go. */
export interface MapContext {
  readonly map: SpecMap;
  readonly version: string;
  readonly findings: Findings;
  /** What the project's catalogs keep under the old names (domain/catalogs.ts). */
  readonly catalogs: CatalogPlan;
}

const PEER_FIELD = "peerDependencies";

const mapLabel = (map: SpecMap): string => (map.kind === "catalog" ? map.catalog : map.field);

/** The new key of an entry of `map`, or undefined when it names no original package. */
const renamedKey = (name: string, map: SpecMap): string | undefined =>
  map.kind === "imports" ? renamedSpecifier(name)?.to : PACKAGE_RENAMES.get(name);

/** The spec a renamed entry gets; `isReported` when it was kept because it is not a range. */
function migrateSpec(spec: string, version: string): { spec: string; isReported: boolean } {
  const npm = migrateNpmSpec(spec, version);
  if (npm !== undefined) {
    return { spec: npm.spec, isReported: npm.isReported };
  }
  const decision = migrateVersionSpec(spec, version);
  return { spec: decision.spec, isReported: decision.kind === "kept" && decision.isReported };
}

/** A rename of one key or name, where it is, and the other names of that place. */
interface Rename {
  readonly from: string;
  readonly to: string;
  readonly field: string;
  readonly names: ReadonlySet<string>;
}

/**
 * Whether the rename can be made: not when the place already has the new name too. Renaming then
 * would give a map the same key twice, and one entry would be lost without a word (finding
 * M10), so the old entry is left and reported.
 */
function isFree({ from, to, field, names }: Rename, findings: Findings): boolean {
  if (names.has(to)) {
    findings.manualSteps.push({ kind: "name-collision", field, from, to });
    return false;
  }
  return true;
}

/** An entry under another name whose spec is an `npm:` alias of an original package. */
function migrateAlias(entry: SpecEntry, { map, version, findings }: MapContext): void {
  const migrated = entry.spec === undefined ? undefined : migrateNpmSpec(entry.spec.value, version);
  if (entry.spec === undefined || migrated === undefined) {
    return;
  }
  findings.edits.push(entry.spec.replace(migrated.spec));
  const spec = hideUrlCredentials(migrated.spec);
  findings.changes.push({ kind: "alias-renamed", field: mapLabel(map), name: entry.name, spec });
  if (migrated.isReported) {
    findings.manualSteps.push({ kind: "spec-kept", name: entry.name, spec });
  }
}

function renamedChange(map: SpecMap, from: string, to: string, spec: string): Change {
  switch (map.kind) {
    case "dependencies":
      return { kind: "dependency-renamed", field: map.field, from, to, spec };
    case "catalog":
      return { kind: "catalog-entry-renamed", catalog: map.catalog, from, to, spec };
    case "imports":
      return { kind: "import-renamed", field: map.field, from, to, target: spec };
    default:
      return assertNever(map);
  }
}

function migrateEntry(
  entry: SpecEntry,
  spec: SpecValue,
  to: string,
  { map, version, findings }: MapContext,
): void {
  const old = spec.value;
  const migrated = migrateSpec(old, version);
  findings.edits.push(entry.renameKey(to));
  if (migrated.spec !== old) {
    findings.edits.push(spec.replace(migrated.spec));
  }
  findings.changes.push(renamedChange(map, entry.name, to, hideUrlCredentials(migrated.spec)));
  if (migrated.isReported) {
    findings.manualSteps.push({ kind: "spec-kept", name: to, spec: hideUrlCredentials(old) });
  }
  if (map.kind === "dependencies" && map.field === PEER_FIELD) {
    findings.manualSteps.push({ kind: "peer-dependency-renamed", name: to });
  }
}

/**
 * Why an entry keeps its old name to stay in step with a catalog, or undefined. A dependency on a
 * catalog entry that stays keeps the name it points at; a catalog entry that a dependency keeps
 * using stays too, so `catalog:` never points at a name the catalog does not have.
 */
function catalogHold(entry: SpecEntry, spec: SpecValue, { map, catalogs }: MapContext) {
  if (map.kind === "catalog") {
    const isInUse = catalogs.inUse.has(map.name, entry.name);
    return isInUse
      ? ({ kind: "catalog-entry-in-use", catalog: map.catalog, name: entry.name } as const)
      : undefined;
  }
  const catalog = map.kind === "dependencies" ? catalogOfSpec(spec.value) : undefined;
  return catalog !== undefined && catalogs.kept.has(catalog, entry.name)
    ? ({ kind: "catalog-reference-kept", field: map.field, name: entry.name, catalog } as const)
    : undefined;
}

/**
 * Rename the original packages of a dependency field or catalog, in place, with `version` as
 * the new version, and retarget `npm:` aliases of them. An entry whose value is not a string (a
 * YAML anchor or flow value) is not one the tool understands: it is left and reported.
 */
export function migrateSpecMap(entries: readonly SpecEntry[], context: MapContext): void {
  const names = new Set(entries.map((entry) => entry.name));
  for (const entry of entries) {
    const to = renamedKey(entry.name, context.map);
    const field = mapLabel(context.map);
    if (to === undefined) {
      migrateAlias(entry, context);
      continue;
    }
    if (!isFree({ from: entry.name, to, field, names }, context.findings)) {
      continue;
    }
    const hold = entry.spec === undefined ? undefined : catalogHold(entry, entry.spec, context);
    if (entry.spec === undefined) {
      context.findings.manualSteps.push({ kind: "entry-not-edited", field, name: entry.name });
    } else if (hold !== undefined) {
      context.findings.manualSteps.push(hold);
    } else {
      migrateEntry(entry, entry.spec, to, context);
    }
  }
}

/** Rename the original packages where `field` only names them. */
export function renameNames(
  entries: readonly NameEntry[],
  field: string,
  findings: Findings,
): void {
  const names = new Set(entries.map((entry) => entry.name));
  for (const entry of entries) {
    const to = PACKAGE_RENAMES.get(entry.name);
    if (to !== undefined && isFree({ from: entry.name, to, field, names }, findings)) {
      findings.edits.push(entry.rename(to));
      findings.changes.push({
        kind: "package-name-renamed",
        location: field,
        from: entry.name,
        to,
      });
    }
  }
}
