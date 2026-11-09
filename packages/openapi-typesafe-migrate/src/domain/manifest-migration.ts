import { manifestCatalogMaps } from "./catalogs.js";
import {
  type DocumentRead,
  isMap,
  mapsAt,
  type TreeMap,
  textEntries,
  unreadableConfig,
  valuesAt,
} from "./config-documents.js";
import {
  type Findings,
  migrateSpecMap,
  newFindings,
  type RenameTarget,
  renameNames,
} from "./dependency-map.js";
import type { FileMigration } from "./migration-findings.js";
import { overriddenPackages } from "./override-targets.js";
import {
  DEPENDENCY_FIELDS,
  NAME_KEYED_FIELDS,
  NAME_LIST_FIELDS,
  OLD_PEER_DEPENDENTS,
  OVERRIDE_FIELDS,
  PACKAGE_RENAMES,
} from "./package-names.js";
import { applyTextEdits } from "./text-edits.js";
import { itemEntries, keyEntries, nestedKeys, specEntries } from "./tree-entries.js";

/**
 * A package manifest: package.json, or the `package.yaml` that pnpm reads in its place. It is
 * edited in place: a renamed key or a new spec replaces that one value, and everything else stays
 * as written (domain/config-documents.ts). Scripts are commands: file-migrations.ts migrates
 * them with the other command files.
 */

function migrateDependencyFields(manifest: TreeMap, target: RenameTarget, findings: Findings) {
  for (const field of DEPENDENCY_FIELDS) {
    for (const dependencies of mapsAt(manifest, field)) {
      const map = { kind: "dependencies", field } as const;
      migrateSpecMap(specEntries(dependencies), { ...target, map, findings });
    }
  }
}

/**
 * Keys of the meta fields that name an original package are renamed. A key with a version
 * (`openapi-fetch@0.13.0`, as Yarn allows) would need a new version too, so it is reported.
 */
function migrateNameKeys(manifest: TreeMap, findings: Findings): void {
  for (const field of NAME_KEYED_FIELDS) {
    for (const meta of mapsAt(manifest, field)) {
      renameNames(keyEntries(meta), field, findings);
      const versioned = textEntries(meta)
        .map(({ key }) => key.value)
        .filter((key) => !PACKAGE_RENAMES.has(key));
      for (const name of overriddenPackages(versioned)) {
        findings.manualSteps.push({ kind: "override-names-package", field, name });
      }
    }
  }
}

function migrateNameLists(manifest: TreeMap, findings: Findings): void {
  for (const field of NAME_LIST_FIELDS) {
    for (const list of valuesAt(manifest, field)) {
      if (list.kind === "list") {
        renameNames(itemEntries(list), field, findings);
      }
    }
  }
}

/** bun's `catalog` and `catalogs.<name>`, at the top level and under `workspaces`. */
function migrateCatalogs(manifest: TreeMap, target: RenameTarget, findings: Findings): void {
  for (const { name, label, map } of manifestCatalogMaps(manifest)) {
    const context = {
      ...target,
      map: { kind: "catalog", catalog: label, name } as const,
      findings,
    };
    migrateSpecMap(specEntries(map), context);
  }
}

/** Overrides and resolutions can pin the old packages; changing them needs the user's intent. */
function reportOverrides(manifest: TreeMap, findings: Findings): void {
  for (const field of OVERRIDE_FIELDS) {
    const keys = valuesAt(manifest, field).flatMap(nestedKeys);
    for (const name of overriddenPackages(keys)) {
      findings.manualSteps.push({ kind: "override-names-package", field, name });
    }
  }
}

/** A dependency that needs an original package as its peer keeps needing it after the rename. */
function reportOldPeers(manifest: TreeMap, findings: Findings): void {
  const dependencies = new Set(
    DEPENDENCY_FIELDS.flatMap((field) => mapsAt(manifest, field))
      .flatMap(textEntries)
      .map(({ key }) => key.value),
  );
  for (const [dependent, { peer, range }] of OLD_PEER_DEPENDENTS) {
    if (dependencies.has(dependent)) {
      findings.manualSteps.push({ kind: "old-peer-needed", dependent, peer, range });
    }
  }
}

function migrateManifestMap(manifest: TreeMap, target: RenameTarget, findings: Findings): void {
  migrateDependencyFields(manifest, target, findings);
  migrateNameKeys(manifest, findings);
  migrateNameLists(manifest, findings);
  migrateCatalogs(manifest, target, findings);
  reportOverrides(manifest, findings);
  reportOldPeers(manifest, findings);
}

/**
 * Migrate the package names of a manifest (`read` is `text` parsed): rename the original packages
 * in the dependency fields (with `version` as the new version), in the fields that name
 * dependencies and in bun's catalogs, and report overrides that name the original packages.
 */
export function migratePackageManifest(
  text: string,
  read: DocumentRead,
  target: RenameTarget,
): FileMigration {
  if (read.kind === "unreadable") {
    return unreadableConfig(text, read.offset);
  }
  const findings = newFindings();
  for (const manifest of read.documents.filter(isMap)) {
    migrateManifestMap(manifest, target, findings);
  }
  const { edits, changes, manualSteps } = findings;
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
