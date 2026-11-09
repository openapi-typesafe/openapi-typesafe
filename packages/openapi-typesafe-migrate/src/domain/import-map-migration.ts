// Import maps point at no catalog, so no catalog plan applies to them.
import { NO_CATALOG_PLAN } from "./catalog-plan.js";
import {
  type DocumentRead,
  isMap,
  mapsAt,
  type TreeMap,
  textEntries,
  unreadableConfig,
} from "./config-documents.js";
import { type Findings, migrateSpecMap, newFindings } from "./dependency-map.js";
import type { FileMigration } from "./migration-findings.js";
import { applyTextEdits } from "./text-edits.js";
import { specEntries } from "./tree-entries.js";

/**
 * Deno import maps: the `imports` and `scopes` of `deno.json` / `deno.jsonc`, and of a separate
 * `import_map.json`. Sources import the keys, and the migration renames the packages in sources,
 * so a key that names an original package (`openapi-fetch`, `openapi-fetch/`) gets the new name
 * too, and an `npm:` value gets the new package and version. A value it cannot replace (a URL) is
 * kept and reported. Deno reads these files as JSONC; they are edited in place
 * (domain/config-documents.ts).
 */

const IMPORTS_FIELD = "imports";
const SCOPES_FIELD = "scopes";
const FIELD_SEPARATOR = ".";

function migrateImports(config: TreeMap, version: string, findings: Findings): void {
  for (const imports of mapsAt(config, IMPORTS_FIELD)) {
    const map = { kind: "imports", field: IMPORTS_FIELD } as const;
    migrateSpecMap(specEntries(imports), { map, version, findings, catalogs: NO_CATALOG_PLAN });
  }
  for (const scopes of mapsAt(config, SCOPES_FIELD)) {
    for (const { key, value } of textEntries(scopes)) {
      if (isMap(value)) {
        const field = [SCOPES_FIELD, key.value].join(FIELD_SEPARATOR);
        const map = { kind: "imports", field } as const;
        migrateSpecMap(specEntries(value), { map, version, findings, catalogs: NO_CATALOG_PLAN });
      }
    }
  }
}

/** Migrate the import map of a Deno config or import map file (`read` is `text` parsed). */
export function migrateImportMap(text: string, read: DocumentRead, version: string): FileMigration {
  if (read.kind === "unreadable") {
    return unreadableConfig(text, read.offset);
  }
  const findings = newFindings();
  for (const config of read.documents.filter(isMap)) {
    migrateImports(config, version, findings);
  }
  const { edits, changes, manualSteps } = findings;
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
