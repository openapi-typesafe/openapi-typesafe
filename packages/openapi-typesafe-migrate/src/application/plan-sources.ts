import type { DocumentRead } from "../domain/config-documents.js";
import type { NamedImportMaps } from "./named-import-maps.js";
import type { DocumentReaders } from "./ports.js";
import {
  baseName,
  DENO_CONFIG_FILES,
  IMPORT_MAP_FILE,
  JSON5_MANIFEST_FILE,
  MANIFEST_FILE,
  WORKSPACE_FILE,
  YAML_MANIFEST_FILES,
  YARNRC_FILE_NAME,
} from "./project-file-names.js";

/**
 * How a file takes part in the project plan: a manifest names dependencies on catalogs (and bun
 * keeps catalogs in package.json) and declares packages, a workspace file holds catalogs
 * (domain/catalogs.ts), and a Deno import map declares the packages that sources import.
 */
export interface PlanSource {
  readonly role: "manifest" | "catalogs" | "import-map";
  /** Undefined for a format the tool does not read; such a file counts as declaring all. */
  readonly read: ((text: string, readers: DocumentReaders) => DocumentRead) | undefined;
}

const readJson = (text: string, readers: DocumentReaders) => readers.json.read(text);
const readYaml = (text: string, readers: DocumentReaders) => readers.yaml.read(text);

/**
 * The part a file plays in the project plan, or undefined for a file that plays none.
 * `namedImportMaps` are the files that Deno configs name as their import maps.
 */
export function planSourceOf(
  path: string,
  namedImportMaps: NamedImportMaps,
): PlanSource | undefined {
  const name = baseName(path);
  if (namedImportMaps.has(path) || DENO_CONFIG_FILES.has(name) || name === IMPORT_MAP_FILE) {
    return { role: "import-map", read: readJson };
  }
  if (name === MANIFEST_FILE) {
    return { role: "manifest", read: readJson };
  }
  if (YAML_MANIFEST_FILES.has(name)) {
    return { role: "manifest", read: readYaml };
  }
  if (name === JSON5_MANIFEST_FILE) {
    return { role: "manifest", read: undefined };
  }
  const isCatalogFile = name === WORKSPACE_FILE || name === YARNRC_FILE_NAME;
  return isCatalogFile ? { role: "catalogs", read: readYaml } : undefined;
}
