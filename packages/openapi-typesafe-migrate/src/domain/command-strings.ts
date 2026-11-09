import { migrateCommand } from "./command-migration.js";
import { lineAt, type ManualStep } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import type { SourceString } from "./source-migration.js";

/** No location: the step names the line of the string instead. */
const NO_LOCATION = "";

/**
 * Strings of a source file that run the generator, such as `execSync("npx openapi-typescript …")`
 * or the command of `spawn` with `shell: true`. They are reported with the migrated command, not
 * changed: a string is data, and only the author knows that it reaches a shell.
 */
export function commandStringSteps(text: string, strings: readonly SourceString[]): ManualStep[] {
  return strings.flatMap((found) => {
    // A string that is just a package name is reported by the specifier migration.
    if (found.isModuleSpecifier || PACKAGE_RENAMES.has(found.value)) {
      return [];
    }
    const migrated = migrateCommand(found.value, NO_LOCATION).text;
    return migrated === found.value
      ? []
      : [{ kind: "command-string" as const, line: lineAt(text, found.start), to: migrated }];
  });
}
