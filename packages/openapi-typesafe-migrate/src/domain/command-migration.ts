import type { Change, ManualStep } from "./migration-findings.js";
import { FLAG_RENAMES, GENERATOR_COMMAND, MIGRATED_GENERATOR_COMMAND } from "./package-names.js";

/**
 * The generator command in a script or shell line. It counts only as a whole word that starts a
 * command or follows white space or shell punctuation, so `node_modules/openapi-typescript/...`
 * and `openapi-typescript-helpers` are left alone.
 */
const COMMAND_RE = new RegExp(`(?<=^|[\\s"'\`;&|(])${GENERATOR_COMMAND}(?=$|[\\s"'\`;&|)])`, "g");
/** `openapi-typescript@7` pins the old package for npx; a new version cannot be guessed. */
const VERSIONED_COMMAND_RE = new RegExp(`(?<=^|[\\s"'\`;&|(])${GENERATOR_COMMAND}@`);
const MIGRATED_COMMAND_RE = new RegExp(
  `(?<=^|[\\s"'\`;&|(])${MIGRATED_GENERATOR_COMMAND}(?=$|[\\s"'\`;&|)])`,
);
const FLAG_RE = new RegExp(`(?<=\\s)(${[...FLAG_RENAMES.keys()].join("|")})(?=$|[\\s=])`, "g");

/** One command line or script after the migration. */
export interface CommandMigration {
  readonly text: string;
  readonly changes: readonly Change[];
  readonly manualSteps: readonly ManualStep[];
}

function renameFlags(text: string, location: string, changes: Change[]): string {
  if (!MIGRATED_COMMAND_RE.test(text)) {
    return text;
  }
  return text.replace(FLAG_RE, (flag) => {
    const renamed = FLAG_RENAMES.get(flag) as string;
    changes.push({ kind: "flag-renamed", location, from: flag, to: renamed });
    return renamed;
  });
}

/**
 * Rename the generator command in one script or line, and then the renamed flags of that command.
 * `location` names the place for the report (a script name, or `file:line`).
 */
export function migrateCommand(text: string, location: string): CommandMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  if (VERSIONED_COMMAND_RE.test(text)) {
    manualSteps.push({ kind: "versioned-command", location });
  }
  const renamed = text.replace(COMMAND_RE, () => {
    changes.push({ kind: "command-renamed", location });
    return MIGRATED_GENERATOR_COMMAND;
  });
  return { text: renameFlags(renamed, location, changes), changes, manualSteps };
}

/** Every line of a shell script, CI workflow or Makefile, through `migrateCommand`. */
export function migrateCommandLines(text: string, file: string): CommandMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  const lines = text.split("\n").map((line, index) => {
    const migrated = migrateCommand(line, `${file}:${index + 1}`);
    changes.push(...migrated.changes);
    manualSteps.push(...migrated.manualSteps);
    return migrated.text;
  });
  return { text: lines.join("\n"), changes, manualSteps };
}
