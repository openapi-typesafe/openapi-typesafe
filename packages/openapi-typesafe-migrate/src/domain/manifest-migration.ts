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
import { declaredNames } from "./declared-packages.js";
import {
  type Findings,
  migrateSpecMap,
  newFindings,
  type RenameTarget,
  renameNames,
} from "./dependency-map.js";
import { JEST_FIELD, jestConfigSteps } from "./jest-config.js";
import { type FileMigration, unchanged } from "./migration-findings.js";
import { overriddenPackages } from "./override-targets.js";
import {
  DEPENDENCY_FIELDS,
  NAME_KEYED_FIELDS,
  NAME_LIST_FIELDS,
  namesOriginalPackage,
  OLD_PEER_DEPENDENTS,
  OVERRIDE_FIELDS,
  PACKAGE_RENAMES,
  PNPM_SETTINGS_FIELD,
} from "./package-names.js";
import { reportSettingSections, type SettingsFile } from "./settings-sections.js";
import {
  migrateBrowserField,
  migrateSubpathImports,
  reportOldPackagePaths,
} from "./specifier-maps.js";
import { overriddenOldPackages } from "./successor-aliases.js";
import { applyTextEdits } from "./text-edits.js";
import { itemEntries, keyEntries, specEntries } from "./tree-entries.js";

/**
 * A package manifest: package.json, or the `package.yaml` that pnpm reads in its place. It is
 * edited in place: a renamed key or a new spec replaces that one value, and everything else stays
 * as written (domain/config-documents.ts). Scripts are commands: file-migrations.ts migrates
 * them with the other command files.
 */

/** TypeScript's `typesVersions`: its paths may point into the installed files of an old package. */
const TYPES_VERSIONS_FIELD = "typesVersions";

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

/** pnpm's settings in package.json: none of them is migrated, `overrides` among them. */
const PNPM_SETTINGS: SettingsFile = {
  migratedSections: new Set(),
  overrideSections: new Set(["overrides", "patchedDependencies"]),
  prefix: `${PNPM_SETTINGS_FIELD}.`,
};

/**
 * Overrides, resolutions and pnpm's settings can name the old packages; changing them needs the
 * user's intent (domain/settings-sections.ts).
 */
function reportSettings(manifest: TreeMap, findings: Findings): void {
  for (const field of OVERRIDE_FIELDS) {
    for (const name of valuesAt(manifest, field).flatMap(overriddenOldPackages)) {
      findings.manualSteps.push({ kind: "override-names-package", field, name });
    }
  }
  for (const settings of mapsAt(manifest, PNPM_SETTINGS_FIELD)) {
    reportSettingSections(settings, PNPM_SETTINGS, findings);
  }
}

/**
 * A dependency that needs an original package as its peer keeps needing it after the rename,
 * unless an override of this manifest or of a workspace above it (`aliased`, from the project
 * plan) already points the peer at its successor.
 */
function reportOldPeers(manifest: TreeMap, aliased: ReadonlySet<string>, findings: Findings) {
  const dependencies = new Set(declaredNames(manifest));
  for (const [dependent, { peer, range }] of OLD_PEER_DEPENDENTS) {
    if (dependencies.has(dependent) && !aliased.has(peer)) {
      findings.manualSteps.push({ kind: "old-peer-needed", dependent, peer, range });
    }
  }
}

/**
 * What a manifest is migrated with: the rename target, and the original packages that the
 * overrides of a workspace above it alias to their successors (domain/successor-aliases.ts).
 */
export interface ManifestTarget extends RenameTarget {
  readonly aliased?: ReadonlySet<string>;
}

function migrateManifestMap(manifest: TreeMap, target: ManifestTarget, findings: Findings): void {
  migrateDependencyFields(manifest, target, findings);
  migrateNameKeys(manifest, findings);
  migrateNameLists(manifest, findings);
  migrateCatalogs(manifest, target, findings);
  migrateSubpathImports(manifest, findings);
  migrateBrowserField(manifest, findings);
  for (const versions of valuesAt(manifest, TYPES_VERSIONS_FIELD)) {
    reportOldPackagePaths(versions, [TYPES_VERSIONS_FIELD], findings);
  }
  reportSettings(manifest, findings);
  for (const jest of valuesAt(manifest, JEST_FIELD)) {
    findings.manualSteps.push(...jestConfigSteps(jest, [JEST_FIELD]));
  }
  reportOldPeers(manifest, target.aliased ?? new Set(), findings);
}

/**
 * Migrate the package names of a manifest (`read` is `text` parsed): rename the original packages
 * in the dependency fields (with `version` as the new version), in the fields that name
 * dependencies, in bun's catalogs, in the targets of subpath imports and in the `browser` field,
 * and report overrides that name the original packages.
 */
export function migratePackageManifest(
  text: string,
  read: DocumentRead,
  target: ManifestTarget,
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

/**
 * A manifest in a format the tool does not read: pnpm's `package.json5`. JSON5 has its own
 * strings (single quotes, line continuations), so it is not edited; a manifest that names an
 * original package is reported for the user to migrate.
 */
export function unreadManifest(text: string): FileMigration {
  return namesOriginalPackage(text)
    ? { ...unchanged(text), manualSteps: [{ kind: "manifest-not-read" }] }
    : unchanged(text);
}
