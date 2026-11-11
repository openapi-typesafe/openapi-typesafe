import { documentStrings, type TreeMap, type TreeNode, textEntries } from "./config-documents.js";
import type { Findings } from "./dependency-map.js";
import { packageReference } from "./old-package-words.js";
import { overrideTarget } from "./override-targets.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import { overriddenOldPackages } from "./successor-aliases.js";
import { nestedKeys } from "./tree-entries.js";

/**
 * The settings of a package manager name packages in keys and values of every shape:
 * `packageExtensions: { "openapi-fetch@*": … }`, `allowedDeprecatedVersions`,
 * `onlyBuiltDependencies: [openapi-fetch]`, `overrides: { "app>openapi-fetch": … }`. A setting
 * that names an old package no longer applies once it is renamed, and what the new name needs
 * there is the user's call, so each one is reported, never changed.
 */

/** How the sections of one settings map are read. */
export interface SettingsFile {
  /** Sections the migration renames itself (catalogs) or that hold no names (`packages`). */
  readonly migratedSections: ReadonlySet<string>;
  /** Sections that change what is installed; they are reported as overrides. */
  readonly overrideSections: ReadonlySet<string>;
  /** What comes before a section's key in the report (`pnpm.`). */
  readonly prefix: string;
}

/**
 * The old packages that `node` names, each once, in order: by its keys at any depth, with a path
 * or a version around the name (`a>openapi-fetch@0`), and by its string values, as a name with an
 * optional `npm:` and version (`openapi-fetch`, `npm:openapi-fetch@0.13`).
 */
export function oldPackagesNamedBy(node: TreeNode): string[] {
  const values = documentStrings([node]).map((string) => packageReference(string.value).name);
  const names = [...nestedKeys(node).map(overrideTarget), ...values];
  return [...new Set(names.filter((name) => PACKAGE_RENAMES.has(name)))];
}

/** Report each section of `settings` that names an old package, by its key. */
export function reportSettingSections(
  settings: TreeMap,
  file: SettingsFile,
  findings: Findings,
): void {
  for (const { key, value } of textEntries(settings)) {
    if (file.migratedSections.has(key.value)) {
      continue;
    }
    const field = `${file.prefix}${key.value}`;
    const isOverride = file.overrideSections.has(key.value);
    const names = isOverride ? overriddenOldPackages(value) : oldPackagesNamedBy(value);
    for (const name of names) {
      findings.manualSteps.push(
        isOverride
          ? { kind: "override-names-package", field, name }
          : { kind: "setting-names-package", field, name },
      );
    }
  }
}
