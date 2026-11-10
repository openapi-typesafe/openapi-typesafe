import {
  type DocumentPath,
  type DocumentRead,
  isMap,
  type TreeNode,
  textEntries,
} from "./config-documents.js";
import { lineLocator, type ManualStep } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import { namesRenamedModule, type SourceString } from "./source-migration.js";

/**
 * Jest names packages inside patterns: `moduleNameMapper: { "^openapi-fetch$": … }`,
 * `transformIgnorePatterns: ["node_modules/(?!(openapi-fetch)/)"]`. A pattern is not a module
 * specifier, and whether it should match the new name is the user's call, so each one that names
 * an old package is reported, never changed: in `jest.config.*`, and in the `jest` field of
 * package.json.
 */

/** The names Jest looks for its config under. */
const JEST_CONFIG_RE = /^jest\.config\.(?:[cm]?[jt]s|json)$/;
export const JEST_FIELD = "jest";
/** A character that a package name can go on with; a name in a pattern is not followed by one. */
const NAME_CHARACTER_RE = /[\w-]/;
const FIELD_SEPARATOR = ".";

export const isJestConfig = (fileName: string): boolean => JEST_CONFIG_RE.test(fileName);

/** Whether `name` is in `value` as a whole package name, not a part of a longer one. */
function hasWholeName(value: string, name: string): boolean {
  for (let at = value.indexOf(name); at !== -1; at = value.indexOf(name, at + 1)) {
    const before = value[at - 1] ?? "";
    const after = value[at + name.length] ?? "";
    if (!NAME_CHARACTER_RE.test(before) && !NAME_CHARACTER_RE.test(after)) {
      return true;
    }
  }
  return false;
}

/** The old packages that a pattern names, in the order of PACKAGE_RENAMES. */
export const oldPackagesInPattern = (value: string): string[] =>
  [...PACKAGE_RENAMES.keys()].filter((name) => hasWholeName(value, name));

/**
 * The steps for the old packages a pattern names. `isNameReported` is true where a string that is
 * a module name is reported already: the source migration reports such a string of a script
 * (`"openapi-fetch"`, `"openapi-fetch/$1"`) as a string that names the package. Nothing reports a
 * JSON value, so there it is a step too.
 */
const patternSteps = (value: string, location: string, isNameReported: boolean): ManualStep[] =>
  isNameReported && namesRenamedModule(value)
    ? []
    : oldPackagesInPattern(value).map((name) => ({
        kind: "pattern-names-package",
        location,
        value,
        name,
        to: PACKAGE_RENAMES.get(name) ?? name,
      }));

/** The steps for the strings of a Jest config script that are not module specifiers. */
export function jestScriptSteps(text: string, strings: readonly SourceString[]): ManualStep[] {
  const lineOf = lineLocator(text);
  return strings
    .filter((string) => !string.isModuleSpecifier)
    .flatMap((string) => patternSteps(string.value, `line ${lineOf(string.start)}`, true));
}

/** The keys and string values of `node` with the key path they are at. */
function textsAt(node: TreeNode, path: DocumentPath): { value: string; path: DocumentPath }[] {
  switch (node.kind) {
    case "scalar":
      return [{ value: node.value, path }];
    case "list":
      return node.items.flatMap((item, index) => textsAt(item, [...path, index]));
    case "map":
      return textEntries(node).flatMap(({ key, value }) => [
        { value: key.value, path },
        ...textsAt(value, [...path, key.value]),
      ]);
    default:
      return [];
  }
}

/** The steps for a Jest config in JSON: `node` at `path` (`["jest"]` in package.json). */
export const jestConfigSteps = (node: TreeNode, path: DocumentPath): ManualStep[] =>
  textsAt(node, path).flatMap(({ value, path: at }) =>
    patternSteps(value, at.join(FIELD_SEPARATOR), false),
  );

/** The steps for `jest.config.json`, read as `read`. */
export const jestJsonSteps = (read: DocumentRead): ManualStep[] =>
  read.kind === "read"
    ? read.documents.filter(isMap).flatMap((root) => jestConfigSteps(root, []))
    : [];
