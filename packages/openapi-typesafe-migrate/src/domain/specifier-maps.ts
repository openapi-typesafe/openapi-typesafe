import {
  documentStrings,
  isMap,
  type TreeMap,
  type TreeNode,
  textEntries,
  valuesAt,
} from "./config-documents.js";
import { type Findings, isFree } from "./dependency-map.js";
import { type RenamedSpecifier, renamedSpecifier } from "./package-names.js";
import { replaceScalar } from "./tree-entries.js";

/**
 * Config maps that name modules by their specifiers, as keys or as targets. The imports get the
 * new names (domain/source-migration.ts), so a key or target that names an original package, or
 * a subpath of it, would no longer match or resolve: it gets the new name too.
 */

const PATH_SEPARATOR = ".";

/**
 * Node's subpath imports: `"imports": { "#client": "openapi-fetch" }` maps a private name to a
 * target, a string under any nesting of conditions and fallback lists. The `#` keys are the
 * project's own names and stay.
 */
const IMPORTS_FIELD = "imports";

/**
 * The `browser` field of bundlers: `"browser": { "openapi-fetch": false }` replaces a module, keyed
 * by its specifier, with another one or with nothing. A string `browser` names the package's own
 * file and stays.
 */
const BROWSER_FIELD = "browser";

/** A deep specifier reaches into the package's files, whose layout is not part of the contract. */
function reportDeep(renamed: RenamedSpecifier, location: string, findings: Findings): void {
  if (renamed.isDeep) {
    findings.manualSteps.push({ kind: "deep-target", location, specifier: renamed.to });
  }
}

/**
 * Rename the module specifiers among the strings below `nodes` (`field` locates them in the
 * report): a target that names an original package, or a subpath of it, gets the new name.
 */
export function renameSpecifierTargets(
  nodes: readonly TreeNode[],
  field: string,
  findings: Findings,
): void {
  for (const target of documentStrings(nodes)) {
    const renamed = renamedSpecifier(target.value);
    if (renamed === undefined) {
      continue;
    }
    const location = [field, ...target.path].join(PATH_SEPARATOR);
    if (target.encode === undefined) {
      findings.manualSteps.push({ kind: "entry-not-edited", field: location, name: target.value });
      continue;
    }
    findings.edits.push(replaceScalar({ ...target, encode: target.encode }, renamed.to));
    findings.changes.push({
      kind: "package-name-renamed",
      location,
      from: target.value,
      to: renamed.to,
    });
    reportDeep(renamed, location, findings);
  }
}

/** A key that was renamed, by where it is, with its new name. */
interface RenamedKey {
  readonly location: string;
  readonly renamed: RenamedSpecifier;
}

/**
 * Rename the keys of `map` that are specifiers of an original package (`field` locates them), and
 * return them. A key whose new name the map already has is kept and reported, as dependency keys
 * are.
 */
export function renameSpecifierKeys(map: TreeMap, field: string, findings: Findings): RenamedKey[] {
  const keys = textEntries(map).map(({ key }) => key);
  const names = new Set(keys.map((key) => key.value));
  return keys.flatMap((key): RenamedKey[] => {
    const renamed = renamedSpecifier(key.value);
    if (renamed === undefined) {
      return [];
    }
    if (key.encode === undefined) {
      findings.manualSteps.push({ kind: "entry-not-edited", field, name: key.value });
      return [];
    }
    const { to } = renamed;
    if (!isFree({ from: key.value, to, field, names }, findings)) {
      return [];
    }
    findings.edits.push(replaceScalar({ ...key, encode: key.encode }, to));
    findings.changes.push({ kind: "package-name-renamed", location: field, from: key.value, to });
    return [{ location: `${field}${PATH_SEPARATOR}${key.value}`, renamed }];
  });
}

export function migrateSubpathImports(manifest: TreeMap, findings: Findings): void {
  renameSpecifierTargets(valuesAt(manifest, IMPORTS_FIELD), IMPORTS_FIELD, findings);
}

export function migrateBrowserField(manifest: TreeMap, findings: Findings): void {
  for (const browser of valuesAt(manifest, BROWSER_FIELD).filter(isMap)) {
    // A deep key replaces a file of the package, which the new package may not have there.
    for (const { location, renamed } of renameSpecifierKeys(browser, BROWSER_FIELD, findings)) {
      reportDeep(renamed, location, findings);
    }
    for (const { key, value } of textEntries(browser)) {
      renameSpecifierTargets([value], `${BROWSER_FIELD}${PATH_SEPARATOR}${key.value}`, findings);
    }
  }
}
