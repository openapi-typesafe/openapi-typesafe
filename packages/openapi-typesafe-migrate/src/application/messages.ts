import { assertNever } from "../domain/assert-never.js";
import type { Change, ManualStep, TransformKeepReason } from "../domain/migration-findings.js";
import { PACKAGE_RENAMES } from "../domain/package-names.js";
import type { SkipReason } from "./ports.js";

/** The user-facing text of the report (CODING_PRINCIPLES 7.8: kept apart from the logic). */

// The same guide the generator links in its deprecation warning.
const IR_CALLBACKS_GUIDE =
  "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/node.md#ir-callbacks";
const OPENAPI_FETCH_ALIAS_GUIDE =
  "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/fetch/index.md" +
  "#libraries-built-on-openapi-fetch";

export function changeMessage(change: Change): string {
  switch (change.kind) {
    case "dependency-renamed":
      return `${change.field}: ${change.from} → ${change.to}@${change.spec}`;
    case "catalog-entry-renamed":
      return `catalog: ${change.from} → ${change.to}`;
    case "command-renamed":
      return `${change.location}: openapi-typescript → openapi-typesafe`;
    case "flag-renamed":
      return `${change.location}: ${change.from} → ${change.to}`;
    case "specifier-renamed":
      return `line ${change.line}: "${change.from}" → "${change.to}"`;
    case "transform-rewritten":
      return `line ${change.line}: transform returns type text; irCallbacks: true added`;
    default:
      return assertNever(change);
  }
}

const KEEP_REASONS: Readonly<Record<TransformKeepReason, string>> = {
  "other-callbacks":
    "postTransform or transformProperty are set too, and they need TypeScript nodes",
  "not-a-function": "it is not an inline function or a function of this file",
  "shared-function": "the function it names is used elsewhere too",
  "unknown-return": "a return value is not a plain ts.factory type",
};

const PEER_NOTE = "users of this package must switch too (a breaking change for them)";
const PINNED_NOTE = "change it to openapi-typesafe@<version>";
const DEEP_IMPORT_NOTE = "imports a file inside the package; check that it exists";
const STRING_NOTE = "is a string, not a module specifier, so it was kept";
const STRING_FIX_NOTE = "if it names the package, change it to";
const KEPT_NOTE = `it works, with a deprecation warning. See ${IR_CALLBACKS_GUIDE}`;
const LEGACY_CALLBACK_NOTE = `receives TypeScript nodes (deprecated). See ${IR_CALLBACKS_GUIDE}`;

function oldPeerMessage(step: Extract<ManualStep, { kind: "old-peer-needed" }>): string {
  const { dependent, peer, range } = step;
  const successor = PACKAGE_RENAMES.get(peer) ?? peer;
  return (
    `${dependent} takes its client type from ${peer}@${range}, its peer dependency: alias ` +
    `${peer} to ${successor} with overrides or resolutions, or passing it the ${successor} ` +
    `client fails to type-check. See ${OPENAPI_FETCH_ALIAS_GUIDE}`
  );
}

export function manualStepMessage(step: ManualStep): string {
  switch (step.kind) {
    case "manifest-unreadable":
      return `package.json is not valid JSON (${step.reason}); migrate it by hand`;
    case "peer-dependency-renamed":
      return `${step.name} is a peer dependency: ${PEER_NOTE}`;
    case "spec-kept":
      return `${step.name} kept the spec "${step.spec}": point it at an openapi-typesafe version`;
    case "override-names-package":
      return `"${step.field}" names ${step.name}: update or remove that override`;
    case "versioned-command":
      return `${step.location} runs a pinned openapi-typescript@<version>: ${PINNED_NOTE}`;
    case "deep-import":
      return `line ${step.line}: "${step.specifier}" ${DEEP_IMPORT_NOTE}`;
    case "string-names-package":
      return `line ${step.line}: "${step.value}" ${STRING_NOTE}; ${STRING_FIX_NOTE} "${step.to}"`;
    case "old-peer-needed":
      return oldPeerMessage(step);
    case "transform-not-rewritten":
      return `line ${step.line}: transform kept (${KEEP_REASONS[step.reason]}); ${KEPT_NOTE}`;
    case "legacy-callback":
      return `line ${step.line}: ${step.callback} ${LEGACY_CALLBACK_NOTE}`;
    default:
      return assertNever(step);
  }
}

export const SKIPPED_HEADING = "Skipped (not read, not written):";

const SKIP_REASONS: Readonly<Record<SkipReason, string>> = {
  "outside-root":
    "git listed it, but it is outside the project folder; check where this git index came from",
};

export function skipReasonMessage(reason: SkipReason): string {
  return SKIP_REASONS[reason];
}

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
