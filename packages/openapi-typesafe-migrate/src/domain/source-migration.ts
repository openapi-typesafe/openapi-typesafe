import type { ImportedSpecifier } from "./declared-packages.js";
import {
  type Change,
  type FileMigration,
  lineLocator,
  type ManualStep,
} from "./migration-findings.js";
import { migrateNpmSpec } from "./npm-alias.js";
import {
  oldPackageInNodeModules,
  PACKAGE_RENAMES,
  type RenamedSpecifier,
  renamedSpecifier,
} from "./package-names.js";
import { hideUrlCredentials } from "./url-credentials.js";

/**
 * A string literal of a source file, as a parser finds it. `start` and `end` are the offsets of
 * its value, inside the quotes. `isModuleSpecifier` is true where the string names a module:
 * `import … from`, `export … from`, `import()`, `require()`, `import x = require()`,
 * `import("…")` types and JSDoc `@import` tags, `declare module`, `/// <reference types>` and the
 * module mocks of vitest, jest and bun. Strings nest: a template with substitutions spans its
 * text as written, so the strings inside its `${…}` lie within it.
 */
export interface SourceString {
  readonly start: number;
  readonly end: number;
  readonly value: string;
  readonly isModuleSpecifier: boolean;
}

/** Source file extensions whose text can hold module specifiers. */
export const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".svelte",
  ".astro",
  ".mdx",
]);

/** A renamed specifier; `keptSpec` is the old spec when its range could not be replaced. */
interface RenamedValue extends RenamedSpecifier {
  readonly keptSpec?: string;
}

/**
 * The new specifier: a package name or subpath, or a Deno `npm:` specifier
 * (`npm:openapi-fetch@^0.13`), which gets the new package and version.
 */
function renamedValue(value: string, version: string): RenamedValue | undefined {
  const npm = migrateNpmSpec(value, version);
  if (npm === undefined) {
    return renamedSpecifier(value);
  }
  const renamed = { to: npm.spec, isDeep: npm.isDeep };
  return npm.isReported ? { ...renamed, keptSpec: hideUrlCredentials(value) } : renamed;
}

const TEMPLATE_SUBSTITUTION = "${";

/**
 * The new name of an original package that a template specifier ends its name with, right before
 * a substitution (`openapi-fetch${suffix}`). The substitution may go on with the name or start a
 * subpath, so only the user knows what to write; undefined for any other specifier.
 */
function dynamicPackage(value: string): string | undefined {
  const at = value.indexOf(TEMPLATE_SUBSTITUTION);
  return at === -1 ? undefined : PACKAGE_RENAMES.get(value.slice(0, at));
}

/** Outer strings first: a string that holds another starts no later and ends no earlier. */
const byStartThenOuter = (left: SourceString, right: SourceString): number =>
  left.start - right.start || right.end - left.end;

/**
 * The strings in file order, outer before inner, each span once. A span found twice (two scripts
 * of a component that overlap) is one string, and a module specifier if either finding says so.
 * Spans may nest, as a template holds the strings of its substitutions; spans that cross cannot
 * both be replaced: that is a scanner bug, and editing on would corrupt the file.
 */
function distinctStrings(strings: readonly SourceString[]): SourceString[] {
  const distinct: SourceString[] = [];
  const enclosing: SourceString[] = [];
  for (const found of [...strings].sort(byStartThenOuter)) {
    const previous = distinct.at(-1);
    if (previous?.start === found.start && previous.end === found.end) {
      const isModuleSpecifier = previous.isModuleSpecifier || found.isModuleSpecifier;
      distinct[distinct.length - 1] = { ...previous, isModuleSpecifier };
      continue;
    }
    let outer = enclosing.at(-1);
    while (outer !== undefined && outer.end <= found.start) {
      enclosing.pop();
      outer = enclosing.at(-1);
    }
    if (outer !== undefined && found.end > outer.end) {
      throw new Error(
        `Source strings overlap at offsets ${outer.start}-${outer.end} and ` +
          `${found.start}-${found.end}; the file was not changed.`,
      );
    }
    enclosing.push(found);
    distinct.push(found);
  }
  return distinct;
}

const dynamicStep = (line: number, value: string, to: string): ManualStep => ({
  kind: "dynamic-specifier",
  line,
  value,
  to,
});

/**
 * The steps for a string that is not renamed: a module name built at run time from an old
 * package name, or a path into the installed files of an old package, which the new package
 * does not have there.
 */
function unrenamedSteps(found: SourceString, line: number, dynamic: string | undefined) {
  if (dynamic !== undefined) {
    return [dynamicStep(line, found.value, dynamic)];
  }
  const name = found.isModuleSpecifier ? oldPackageInNodeModules(found.value) : undefined;
  const to = name === undefined ? undefined : PACKAGE_RENAMES.get(name);
  return name === undefined || to === undefined
    ? []
    : [{ kind: "old-package-import" as const, line, specifier: found.value, name, to }];
}

/**
 * Rename the original packages where a source file names them as modules. A string that equals a
 * package name anywhere else (an object key, a label, a config value) may mean the package or
 * may not, so it is reported, not changed. Comments are not strings and stay as written.
 */
export function migrateModuleSpecifiers(
  text: string,
  strings: readonly SourceString[],
  version: string,
): FileMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  let migrated = "";
  let copiedUpTo = 0;
  const lineOf = lineLocator(text);
  for (const found of distinctStrings(strings)) {
    const renamed = renamedValue(found.value, version);
    const line = lineOf(found.start);
    const dynamic = found.isModuleSpecifier ? dynamicPackage(found.value) : undefined;
    if (renamed === undefined) {
      manualSteps.push(...unrenamedSteps(found, line, dynamic));
      continue;
    }
    // A string inside a template that was replaced is part of the replacement, which keeps it as
    // written, so it can only be reported.
    if (!found.isModuleSpecifier || found.start < copiedUpTo) {
      manualSteps.push({ kind: "string-names-package", line, value: found.value, to: renamed.to });
      continue;
    }
    changes.push({ kind: "specifier-renamed", line, from: found.value, to: renamed.to });
    // A deep import reaches into the package's files, whose layout is not part of the contract.
    if (renamed.isDeep) {
      manualSteps.push({ kind: "deep-import", line, specifier: renamed.to });
    }
    if (renamed.keptSpec !== undefined) {
      manualSteps.push({ kind: "spec-kept", name: renamed.to, spec: renamed.keptSpec });
    }
    migrated += `${text.slice(copiedUpTo, found.start)}${renamed.to}`;
    copiedUpTo = found.end;
  }
  return { text: migrated + text.slice(copiedUpTo), changes, manualSteps };
}

/**
 * The module specifiers of a source file as the migration leaves them: an original package with
 * its new name, any other specifier as written, each with its line.
 */
export function importedSpecifiers(
  text: string,
  strings: readonly SourceString[],
): ImportedSpecifier[] {
  const lineOf = lineLocator(text);
  return strings
    .filter((found) => found.isModuleSpecifier)
    .map((found) => ({
      specifier: renamedSpecifier(found.value)?.to ?? found.value,
      line: lineOf(found.start),
    }));
}
