import { catalogMaps } from "./catalogs.js";
import { type DocumentRead, isMap, type TreeMap, unreadableConfig } from "./config-documents.js";
import { type Findings, migrateSpecMap, newFindings, type RenameTarget } from "./dependency-map.js";
import type { FileMigration } from "./migration-findings.js";
import { CATALOG_FIELD, NAMED_CATALOGS_FIELD } from "./package-names.js";
import { reportSettingSections, type SettingsFile } from "./settings-sections.js";
import { applyTextEdits } from "./text-edits.js";
import { specEntries } from "./tree-entries.js";

/**
 * Catalogs in YAML: `pnpm-workspace.yaml` (pnpm) and `.yarnrc.yml` (Yarn 4.10 and newer). A
 * project whose package.json says `"openapi-fetch": "catalog:"` keeps its version here, so the
 * entry and that dependency must keep one name whatever its spec is, or the install fails
 * (`ERR_PNPM_CATALOG_ENTRY_NOT_FOUND_FOR_SPEC`); the catalog plan (domain/catalogs.ts) says
 * which entries keep the old one. Only the renamed keys and values are replaced
 * in the text, so comments and formatting stay (domain/config-documents.ts). Only entries of
 * `catalog:` and `catalogs:` are renamed; the other settings that name an original package are
 * reported (domain/settings-sections.ts), like the same fields of package.json.
 */

const CATALOG_SECTIONS = [CATALOG_FIELD, NAMED_CATALOGS_FIELD];

export const PNPM_WORKSPACE_FILE: SettingsFile = {
  migratedSections: new Set([...CATALOG_SECTIONS, "packages"]),
  overrideSections: new Set(["overrides", "patchedDependencies"]),
  prefix: "",
};

/** Yarn keeps overrides in package.json (`resolutions`), not in `.yarnrc.yml`. */
export const YARNRC_FILE: SettingsFile = {
  migratedSections: new Set(CATALOG_SECTIONS),
  overrideSections: new Set(),
  prefix: "",
};

function migrateCatalogs(workspace: TreeMap, target: RenameTarget, findings: Findings): void {
  for (const { name, label, map } of catalogMaps(workspace)) {
    const context = {
      ...target,
      map: { kind: "catalog", catalog: label, name } as const,
      findings,
    };
    migrateSpecMap(specEntries(map), context);
  }
}

/**
 * Rename the original packages in the catalogs of a YAML file (`read` is `text` parsed); report
 * its other settings that name them.
 */
export function migrateWorkspaceCatalogs(
  text: string,
  read: DocumentRead,
  target: RenameTarget,
  file: SettingsFile,
): FileMigration {
  if (read.kind === "unreadable") {
    return unreadableConfig(text, read.offset);
  }
  const findings = newFindings();
  for (const workspace of read.documents.filter(isMap)) {
    migrateCatalogs(workspace, target, findings);
    reportSettingSections(workspace, file, findings);
  }
  const { edits, changes, manualSteps } = findings;
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
