import { type Change, type FileMigration, lineAt, type ManualStep } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";

/**
 * A string literal of a source file, as a parser finds it. `start` and `end` are the offsets of
 * its value, inside the quotes. `isModuleSpecifier` is true where the string names a module:
 * `import … from`, `export … from`, `import()`, `require()`, `import x = require()`,
 * `import("…")` types and JSDoc `@import` tags, `declare module`, `/// <reference types>` and the
 * module mocks of vitest, jest and bun.
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
]);

interface RenamedValue {
  readonly to: string;
  readonly isDeep: boolean;
}

/** The new name of a whole package name, or of a name and a subpath (`openapi-fetch/x`). */
function renamedValue(value: string): RenamedValue | undefined {
  const slash = value.indexOf("/");
  const name = slash === -1 ? value : value.slice(0, slash);
  const renamed = PACKAGE_RENAMES.get(name);
  if (renamed === undefined) {
    return undefined;
  }
  return { to: `${renamed}${value.slice(name.length)}`, isDeep: slash !== -1 };
}

/**
 * Rename the original packages where a source file names them as modules. A string that equals a
 * package name anywhere else (an object key, a label, a config value) may mean the package or
 * may not, so it is reported, not changed. Comments are not strings and stay as written.
 */
export function migrateModuleSpecifiers(
  text: string,
  strings: readonly SourceString[],
): FileMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  let migrated = "";
  let copiedUpTo = 0;
  for (const found of [...strings].sort((left, right) => left.start - right.start)) {
    const renamed = renamedValue(found.value);
    if (renamed === undefined) {
      continue;
    }
    const line = lineAt(text, found.start);
    if (!found.isModuleSpecifier) {
      manualSteps.push({ kind: "string-names-package", line, value: found.value, to: renamed.to });
      continue;
    }
    changes.push({ kind: "specifier-renamed", line, from: found.value, to: renamed.to });
    // A deep import reaches into the package's files, whose layout is not part of the contract.
    if (renamed.isDeep) {
      manualSteps.push({ kind: "deep-import", line, specifier: renamed.to });
    }
    migrated += `${text.slice(copiedUpTo, found.start)}${renamed.to}`;
    copiedUpTo = found.end;
  }
  return { text: migrated + text.slice(copiedUpTo), changes, manualSteps };
}
