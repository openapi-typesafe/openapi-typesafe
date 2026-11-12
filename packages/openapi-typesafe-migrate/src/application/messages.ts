import { assertNever } from "../domain/assert-never.js";
import type { Change } from "../domain/migration-findings.js";
import type { SkipReason } from "./migrate-project.js";
import type { FileProblem } from "./ports.js";

/**
 * The user-facing text of the report (CODING_PRINCIPLES 7.8: kept apart from the logic); the
 * manual steps have their own module, manual-step-messages.ts.
 */

export function changeMessage(change: Change): string {
  switch (change.kind) {
    case "dependency-renamed":
      return `${change.field}: ${change.from} → ${change.to}@${change.spec}`;
    case "catalog-entry-renamed":
      return `${change.catalog}: ${change.from} → ${change.to}@${change.spec}`;
    case "import-renamed":
      return `${change.field}: "${change.from}" → "${change.to}" (${change.target})`;
    case "alias-renamed":
      return `${change.field}: ${change.name} → ${change.spec}`;
    case "command-renamed":
      return `${change.location}: openapi-typescript → openapi-typesafe`;
    case "flag-renamed":
    case "package-name-renamed":
      return `${change.location}: ${change.from} → ${change.to}`;
    case "specifier-renamed":
      return `line ${change.line}: "${change.from}" → "${change.to}"`;
    case "transform-rewritten":
      return `line ${change.line}: transform returns type text; irCallbacks: true added`;
    case "declaration-removed":
      return `line ${change.line}: ${change.name} removed; only the old transform returns used it`;
    default:
      return assertNever(change);
  }
}

export const SKIPPED_HEADING = "Skipped (not migrated, not written):";

/** Why a file was left as it was, after its path in the "Skipped" section. */
export function skippedMessage(reason: SkipReason): string {
  switch (reason.kind) {
    case "outside-root":
      return "it leads outside the project folder (a link, or a path in the git index)";
    case "not-utf-8":
      return "it is not UTF-8 text, so it was not changed; check it by hand";
    case "io-error":
      return `it could not be read (${reason.code})`;
    case "migration-bug":
      return (
        `the tool could not migrate it (${reason.message}), a bug of the tool: it was not ` +
        "changed, so migrate it by hand, and please report the bug"
      );
    default:
      return assertNever(reason);
  }
}

function writeProblemMessage(reason: FileProblem): string {
  switch (reason.kind) {
    case "outside-root":
      return "it leads outside the project folder";
    case "not-utf-8":
      return "its text is not UTF-8";
    case "io-error":
      return reason.code;
    default:
      return assertNever(reason);
  }
}

/** The first line of the report's end when a write failed and the writing stopped. */
export const writeFailedMessage = (path: string, reason: FileProblem): string =>
  `Writing stopped: ${path} could not be written (${writeProblemMessage(reason)}).`;
export const WRITTEN_HEADING = "Written before it:";
export const NOT_WRITTEN_HEADING = "Not written (still as they were):";
export const NONE_WRITTEN = "Nothing was written before it.";

export const NEXT_STEPS: readonly string[] = [
  "Install: run your package manager's install, so the lockfile has the new packages.",
  "Regenerate your types and commit them once: the file header names openapi-typesafe now, " +
    "so `--check` fails until you do.",
  "Run your type check and tests.",
];

export const DRY_RUN_NOTE = "Dry run: nothing was written. Run again with --write to apply.";
export const WRITTEN_NOTE = "Files were written.";
export const NOTHING_FOUND =
  "Nothing to migrate: no openapi-typescript, openapi-fetch, openapi-react-query " +
  "or openapi-typescript-helpers found.";
