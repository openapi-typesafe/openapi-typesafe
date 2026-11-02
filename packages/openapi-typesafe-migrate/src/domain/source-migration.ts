import { type Change, type FileMigration, lineAt, type ManualStep } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";

/**
 * Module specifiers in source files: `"openapi-fetch"` and `'openapi-fetch/subpath'` in
 * imports, `require()`, `import()`, `vi.mock()`, `declare module` and tool configs alike. Only a
 * whole quoted string that is exactly a package name, or a name and a subpath, is renamed, so
 * text that merely mentions a package (comments, `@scope/openapi-fetch`, `openapi-fetch-gen`)
 * stays.
 */
const SPECIFIER_RE = new RegExp(
  `(["'\`])(${[...PACKAGE_RENAMES.keys()].join("|")})(/[^"'\`\\s]*)?\\1`,
  "g",
);

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

/** Rename the original packages in the module specifiers of one source file. */
export function migrateModuleSpecifiers(text: string): FileMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  let migrated = "";
  let copiedUpTo = 0;
  for (const match of text.matchAll(SPECIFIER_RE)) {
    const [whole, quote, name, subpath] = match as unknown as [string, string, string, string?];
    const line = lineAt(text, match.index);
    const to = `${PACKAGE_RENAMES.get(name) as string}${subpath ?? ""}`;
    changes.push({ kind: "specifier-renamed", line, from: whole.slice(1, -1), to });
    // A deep import reaches into the package's files, whose layout is not part of the contract.
    if (subpath !== undefined) {
      manualSteps.push({ kind: "deep-import", line, specifier: to });
    }
    migrated += `${text.slice(copiedUpTo, match.index)}${quote}${to}${quote}`;
    copiedUpTo = match.index + whole.length;
  }
  return { text: migrated + text.slice(copiedUpTo), changes, manualSteps };
}
