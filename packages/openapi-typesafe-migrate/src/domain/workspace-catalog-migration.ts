import {
  type DocumentRead,
  isMap,
  mapsAt,
  type TreeMap,
  textEntries,
  unreadableConfig,
  valuesAt,
} from "./config-documents.js";
import { type Findings, migrateSpecMap, newFindings } from "./dependency-map.js";
import type { FileMigration } from "./migration-findings.js";
import { overriddenPackages } from "./override-targets.js";
import { CATALOG_FIELD, NAMED_CATALOGS_FIELD } from "./package-names.js";
import { applyTextEdits } from "./text-edits.js";
import { nestedKeys, specEntries } from "./tree-entries.js";

/**
 * Catalogs in YAML: `pnpm-workspace.yaml` (pnpm) and `.yarnrc.yml` (Yarn 4.10 and newer). A
 * project whose package.json says `"openapi-fetch": "catalog:"` keeps its version here, so the
 * entry must get the new name whatever its spec is, or the install fails
 * (`ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`). Only the renamed keys and values are replaced
 * in the text, so comments and formatting stay (domain/config-documents.ts). Only entries of
 * `catalog:` and `catalogs:` are renamed; sections that can name an original package without
 * being a catalog are reported, like the same fields of package.json.
 */
export interface CatalogFile {
  /** Sections whose keys can target a package: reported, not renamed. */
  readonly reportedSections: ReadonlySet<string>;
}

export const PNPM_WORKSPACE_FILE: CatalogFile = {
  reportedSections: new Set(["overrides", "patchedDependencies"]),
};

/** Yarn keeps overrides in package.json (`resolutions`), not in `.yarnrc.yml`. */
export const YARNRC_FILE: CatalogFile = { reportedSections: new Set() };

const CATALOG_PATH_SEPARATOR = ".";

function migrateCatalogs(workspace: TreeMap, version: string, findings: Findings): void {
  for (const catalog of mapsAt(workspace, CATALOG_FIELD)) {
    const map = { kind: "catalog", catalog: CATALOG_FIELD } as const;
    migrateSpecMap(specEntries(catalog), { map, version, findings });
  }
  for (const catalogs of mapsAt(workspace, NAMED_CATALOGS_FIELD)) {
    for (const { key, value } of textEntries(catalogs)) {
      if (isMap(value)) {
        const catalog = [NAMED_CATALOGS_FIELD, key.value].join(CATALOG_PATH_SEPARATOR);
        migrateSpecMap(specEntries(value), {
          map: { kind: "catalog", catalog },
          version,
          findings,
        });
      }
    }
  }
}

/** The keys of `sections` (at any depth) that target an original package. */
function reportSections(workspace: TreeMap, file: CatalogFile, findings: Findings): void {
  for (const field of file.reportedSections) {
    for (const name of overriddenPackages(valuesAt(workspace, field).flatMap(nestedKeys))) {
      findings.manualSteps.push({ kind: "override-names-package", field, name });
    }
  }
}

/**
 * Rename the original packages in the catalogs of a YAML file (`read` is `text` parsed); report
 * its other sections that name them.
 */
export function migrateWorkspaceCatalogs(
  text: string,
  read: DocumentRead,
  version: string,
  file: CatalogFile,
): FileMigration {
  if (read.kind === "unreadable") {
    return unreadableConfig(text, read.offset);
  }
  const findings = newFindings();
  for (const workspace of read.documents.filter(isMap)) {
    migrateCatalogs(workspace, version, findings);
    reportSections(workspace, file, findings);
  }
  const { edits, changes, manualSteps } = findings;
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
