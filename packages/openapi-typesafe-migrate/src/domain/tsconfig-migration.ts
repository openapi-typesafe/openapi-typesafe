import {
  type DocumentRead,
  documentStrings,
  isMap,
  mapsAt,
  type TreeMap,
  unreadableConfig,
  valuesAt,
} from "./config-documents.js";
import { type Findings, newFindings, renameNames } from "./dependency-map.js";
import type { FileMigration } from "./migration-findings.js";
import { oldPackageInNodeModules, PACKAGE_RENAMES } from "./package-names.js";
import { renameSpecifierKeys } from "./specifier-maps.js";
import { applyTextEdits } from "./text-edits.js";
import { itemEntries } from "./tree-entries.js";

/**
 * A TypeScript (or JavaScript) project config. Imports get the new names, so the options that
 * name packages get them too: the keys of `compilerOptions.paths` are module specifiers, and
 * `compilerOptions.types` lists packages by name. A path into the installed files of an old
 * package (`node_modules/openapi-fetch/…`, in `paths` or `include`) points at files the new
 * package does not have there, so it is reported.
 */

const COMPILER_OPTIONS_FIELD = "compilerOptions";
const PATHS_FIELD = "paths";
const TYPES_FIELD = "types";
const FIELD_SEPARATOR = ".";

function reportOldPackagePaths(config: TreeMap, findings: Findings): void {
  for (const value of documentStrings([config])) {
    const name = oldPackageInNodeModules(value.value);
    const to = name === undefined ? undefined : PACKAGE_RENAMES.get(name);
    if (name !== undefined && to !== undefined) {
      const location = value.path.join(FIELD_SEPARATOR);
      findings.manualSteps.push({ kind: "old-package-path", location, path: value.value, to });
    }
  }
}

function migrateCompilerOptions(options: TreeMap, findings: Findings): void {
  for (const paths of mapsAt(options, PATHS_FIELD)) {
    // A key maps the imports it matches to the project's own files, so a deep key (`x/*`) still
    // matches the renamed imports and reaches no file of the package.
    const field = [COMPILER_OPTIONS_FIELD, PATHS_FIELD].join(FIELD_SEPARATOR);
    renameSpecifierKeys(paths, field, findings);
  }
  for (const types of valuesAt(options, TYPES_FIELD)) {
    if (types.kind === "list") {
      const field = [COMPILER_OPTIONS_FIELD, TYPES_FIELD].join(FIELD_SEPARATOR);
      renameNames(itemEntries(types), field, findings);
    }
  }
}

/** Migrate the package names of a tsconfig or jsconfig (`read` is `text` parsed). */
export function migrateTsconfig(text: string, read: DocumentRead): FileMigration {
  if (read.kind === "unreadable") {
    return unreadableConfig(text, read.offset);
  }
  const findings = newFindings();
  for (const config of read.documents.filter(isMap)) {
    for (const options of mapsAt(config, COMPILER_OPTIONS_FIELD)) {
      migrateCompilerOptions(options, findings);
    }
    reportOldPackagePaths(config, findings);
  }
  const { edits, changes, manualSteps } = findings;
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
