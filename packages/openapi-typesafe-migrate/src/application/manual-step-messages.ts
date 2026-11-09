import { assertNever } from "../domain/assert-never.js";
import type { ManualStep, TransformKeepReason } from "../domain/migration-findings.js";
import { PACKAGE_RENAMES } from "../domain/package-names.js";
import { commandStepMessage, isCommandStep } from "./command-step-messages.js";

/** The user-facing text of the manual steps in the report (CODING_PRINCIPLES 7.8). */

// The same guide the generator links in its deprecation warning.
const IR_CALLBACKS_GUIDE =
  "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/node.md#ir-callbacks";
const OPENAPI_FETCH_ALIAS_GUIDE =
  "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/fetch/index.md" +
  "#libraries-built-on-openapi-fetch";

const KEEP_REASONS: Readonly<Record<TransformKeepReason, string>> = {
  "other-callbacks":
    "postTransform or transformProperty are set too, and they need TypeScript nodes",
  "not-a-function": "it is not an inline function or a function of this file",
  "shared-function": "the function it names is used elsewhere too",
  "shared-options": "its options object is used elsewhere too",
  "unknown-return": "a return value is not a plain ts.factory type",
  "typed-options":
    "its options are declared with a type built from OpenAPITSOptions, which the tool cannot " +
    "change to OpenAPITSIrOptions",
};

const PEER_NOTE = "users of this package must switch too (a breaking change for them)";
const OPTIONS_NOTE =
  "the options of openapiTS() are not an object written in this file: check them for " +
  `transform, postTransform and transformProperty. See ${IR_CALLBACKS_GUIDE}`;
const MANIFEST_NOT_READ_NOTE =
  "is a JSON5 manifest, which the tool does not read: rename the packages and the generator " +
  "command by hand, or write it as package.json and run the tool again";
const IMPORT_MAP_NOTE =
  "is a URL or a file outside the project folder, so it was not migrated: rename the old " +
  "packages in it by hand";
const PATCH_NOTE = "check whether the fix is still needed, then make the patch again or delete it";
const DEEP_IMPORT_NOTE = "imports a file inside the package; check that it exists";
const DEEP_TARGET_NOTE = "points at a file inside the package; check that it exists";
const DYNAMIC_NOTE =
  "builds its module name at run time from an old package name, so it was kept; rename it to";
const STRING_NOTE = "is a string, not a module specifier, so it was kept";
const STRING_FIX_NOTE = "if it names the package, change it to";
const KEPT_NOTE = `it works, with a deprecation warning. See ${IR_CALLBACKS_GUIDE}`;
const LEGACY_CALLBACK_NOTE = `receives TypeScript nodes (deprecated). See ${IR_CALLBACKS_GUIDE}`;
const HELPER_TYPES_ENTRY = "openapi-typesafe-fetch/helpers";

function packageNotDeclaredMessage(
  step: Extract<ManualStep, { kind: "package-not-declared" }>,
): string {
  const { line, name, installers } = step;
  return (
    `line ${line}: no package.json or Deno import map at or above this file lists ${name}; ` +
    `${installers.join(" and ")} installed it, the openapi-typesafe packages do not: ` +
    `add it to the dependencies, or import the types from ${HELPER_TYPES_ENTRY}`
  );
}

function oldPeerMessage(step: Extract<ManualStep, { kind: "old-peer-needed" }>): string {
  const { dependent, peer, range } = step;
  const successor = PACKAGE_RENAMES.get(peer) ?? peer;
  return (
    `${dependent} takes its client type from ${peer}@${range}, its peer dependency: alias ` +
    `${peer} to ${successor} with overrides or resolutions, or passing it the ${successor} ` +
    `client fails to type-check. See ${OPENAPI_FETCH_ALIAS_GUIDE}`
  );
}

/** Steps for places of a structured file (JSON, YAML) that the tool could not edit. */
type UneditedStep = Extract<
  ManualStep,
  {
    kind:
      | "config-unreadable"
      | "manifest-not-read"
      | "import-map-not-editable"
      | "old-package-patch"
      | "entry-not-edited"
      | "name-collision";
  }
>;

/** Steps for catalog entries and the dependencies on them that keep the old names. */
type CatalogStep = Extract<
  ManualStep,
  { kind: "catalog-reference-kept" | "catalog-entry-outside" | "catalog-entry-in-use" }
>;

function uneditedStepMessage(step: UneditedStep): string {
  switch (step.kind) {
    case "config-unreadable":
      return step.position === undefined
        ? "nests too deep to be read; migrate it by hand"
        : `cannot be parsed at line ${step.position.line}, column ${step.position.column}; ` +
            "migrate it by hand";
    case "manifest-not-read":
      return MANIFEST_NOT_READ_NOTE;
    case "import-map-not-editable":
      return `importMap "${step.reference}" ${IMPORT_MAP_NOTE}`;
    case "old-package-patch":
      return `patches the code of ${step.name}, which ${step.to} does not share: ${PATCH_NOTE}`;
    case "entry-not-edited":
      return `${step.field}: ${step.name} has a value the tool does not read; rename it by hand`;
    case "name-collision":
      return (
        `${step.field} has both ${step.from} and ${step.to}, so ${step.from} was kept: ` +
        "remove one of them"
      );
    default:
      return assertNever(step);
  }
}

function catalogStepMessage(step: CatalogStep): string {
  switch (step.kind) {
    case "catalog-reference-kept":
      return (
        `${step.field}: ${step.name} was kept, because catalog "${step.catalog}" keeps ` +
        `${step.name}: rename the entry and the dependency together`
      );
    case "catalog-entry-outside":
      return (
        `${step.field}: ${step.name} was kept, because no catalog of this project has its ` +
        `"${step.catalog}" entry; a catalog above the root (pnpm-workspace.yaml, .yarnrc.yml or ` +
        "the workspace package.json) may hold it: rename the entry and the dependency together"
      );
    case "catalog-entry-in-use":
      return (
        `${step.catalog}: ${step.name} was kept, because a dependency or an override still ` +
        "names it: rename the entry and what names it together"
      );
    default:
      return assertNever(step);
  }
}

/** Steps for a line of a source file. */
type SourceStep = Extract<
  ManualStep,
  {
    kind:
      | "options-not-inspected"
      | "deep-import"
      | "dynamic-specifier"
      | "string-names-package"
      | "transform-not-rewritten"
      | "legacy-callback"
      | "package-not-declared";
  }
>;

function sourceStepMessage(step: SourceStep): string {
  switch (step.kind) {
    case "options-not-inspected":
      return `line ${step.line}: ${OPTIONS_NOTE}`;
    case "deep-import":
      return `line ${step.line}: "${step.specifier}" ${DEEP_IMPORT_NOTE}`;
    case "dynamic-specifier":
      return `line ${step.line}: \`${step.value}\` ${DYNAMIC_NOTE} ${step.to}`;
    case "string-names-package":
      return `line ${step.line}: "${step.value}" ${STRING_NOTE}; ${STRING_FIX_NOTE} "${step.to}"`;
    case "transform-not-rewritten":
      return `line ${step.line}: transform kept (${KEEP_REASONS[step.reason]}); ${KEPT_NOTE}`;
    case "legacy-callback":
      return `line ${step.line}: ${step.callback} ${LEGACY_CALLBACK_NOTE}`;
    case "package-not-declared":
      return packageNotDeclaredMessage(step);
    default:
      return assertNever(step);
  }
}

/** Steps for the packages a manifest names. */
type PackageStep = Extract<
  ManualStep,
  {
    kind:
      | "peer-dependency-renamed"
      | "spec-kept"
      | "override-names-package"
      | "deep-target"
      | "old-peer-needed";
  }
>;

function packageStepMessage(step: PackageStep): string {
  switch (step.kind) {
    case "peer-dependency-renamed":
      return `${step.name} is a peer dependency: ${PEER_NOTE}`;
    case "spec-kept":
      return `${step.name} kept the spec "${step.spec}": point it at an openapi-typesafe version`;
    case "override-names-package":
      return `"${step.field}" names ${step.name}: update or remove that override`;
    case "deep-target":
      return `${step.location}: "${step.specifier}" ${DEEP_TARGET_NOTE}`;
    case "old-peer-needed":
      return oldPeerMessage(step);
    default:
      return assertNever(step);
  }
}

export function manualStepMessage(step: ManualStep): string {
  if (isCommandStep(step)) {
    return commandStepMessage(step);
  }
  switch (step.kind) {
    case "config-unreadable":
    case "manifest-not-read":
    case "import-map-not-editable":
    case "old-package-patch":
    case "entry-not-edited":
    case "name-collision":
      return uneditedStepMessage(step);
    case "catalog-reference-kept":
    case "catalog-entry-outside":
    case "catalog-entry-in-use":
      return catalogStepMessage(step);
    case "peer-dependency-renamed":
    case "spec-kept":
    case "override-names-package":
    case "deep-target":
    case "old-peer-needed":
      return packageStepMessage(step);
    case "options-not-inspected":
    case "deep-import":
    case "dynamic-specifier":
    case "string-names-package":
    case "transform-not-rewritten":
    case "legacy-callback":
    case "package-not-declared":
      return sourceStepMessage(step);
    default:
      return assertNever(step);
  }
}
