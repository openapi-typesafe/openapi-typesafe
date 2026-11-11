import { assertNever } from "../domain/assert-never.js";
import type { ManualStep } from "../domain/migration-findings.js";
import { PACKAGE_RENAMES } from "../domain/package-names.js";
import { commandStepMessage, isCommandStep } from "./command-step-messages.js";
import { isSourceStep, sourceStepMessage } from "./source-step-messages.js";

/** The user-facing text of the manual steps in the report (CODING_PRINCIPLES 7.8). */

const OPENAPI_FETCH_ALIAS_GUIDE =
  "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/fetch/index.md" +
  "#libraries-built-on-openapi-fetch";

const PEER_NOTE = "users of this package must switch too (a breaking change for them)";
const MANIFEST_NOT_READ_NOTE =
  "is a JSON5 manifest, which the tool does not read: rename the packages and the generator " +
  "command by hand, or write it as package.json and run the tool again";
const IMPORT_MAP_NOTE =
  "is a URL or a file outside the project folder, so it was not migrated: rename the old " +
  "packages in it by hand";
const PATCH_NOTE = "check whether the fix is still needed, then make the patch again or delete it";
const PATTERN_NOTE = "is a pattern that names";
const PATTERN_FIX_NOTE = "where it means the package, make it match";
const SETTING_NOTE = "remove the setting if it no longer applies, or make it name";
const LOCAL_PACKAGE_NOTE =
  "points at a local package, not the npm package, so it and the imports of it were kept: if " +
  "that package is a copy of the original, move it to";
const DEEP_TARGET_NOTE = "points at a file inside the package; check that it exists";
const OLD_PATH_NOTE =
  "is a path into node_modules of an old package, which is no longer installed:";
const OLD_PATH_FIX_NOTE = "point it at the files of";

const renamed = (name: string): string => PACKAGE_RENAMES.get(name) ?? name;

const localPackageMessage = (step: Extract<ManualStep, { kind: "local-package" }>): string =>
  `${step.field}: ${step.name} "${step.spec}" ${LOCAL_PACKAGE_NOTE} ${renamed(step.name)}`;

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
  {
    kind:
      | "catalog-reference-kept"
      | "catalog-entry-outside"
      | "catalog-entry-missing"
      | "catalog-entry-in-use";
  }
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
    case "catalog-entry-missing":
      return (
        `${step.field}: ${step.name} was kept, because no catalog of the workspace has its ` +
        `"${step.catalog}" entry: add the entry, or give the dependency a version`
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

/** Steps for the packages a manifest names. */
type PackageStep = Extract<
  ManualStep,
  {
    kind:
      | "peer-dependency-renamed"
      | "spec-kept"
      | "local-package"
      | "override-names-package"
      | "setting-names-package"
      | "pattern-names-package"
      | "deep-target"
      | "old-package-path"
      | "old-peer-needed";
  }
>;

function packageStepMessage(step: PackageStep): string {
  switch (step.kind) {
    case "peer-dependency-renamed":
      return `${step.name} is a peer dependency: ${PEER_NOTE}`;
    case "spec-kept":
      return `${step.name} kept the spec "${step.spec}": point it at an openapi-typesafe version`;
    case "local-package":
      return localPackageMessage(step);
    case "override-names-package":
      return `"${step.field}" names ${step.name}: update or remove that override`;
    case "setting-names-package":
      return `"${step.field}" names ${step.name}: ${SETTING_NOTE} ${renamed(step.name)}`;
    case "pattern-names-package":
      return (
        `${step.location}: "${step.value}" ${PATTERN_NOTE} ${step.name}: ` +
        `${PATTERN_FIX_NOTE} ${step.to}`
      );
    case "deep-target":
      return `${step.location}: "${step.specifier}" ${DEEP_TARGET_NOTE}`;
    case "old-package-path":
      return `${step.location}: "${step.path}" ${OLD_PATH_NOTE} ${OLD_PATH_FIX_NOTE} ${step.to}`;
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
  if (isSourceStep(step)) {
    return sourceStepMessage(step);
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
    case "catalog-entry-missing":
    case "catalog-entry-in-use":
      return catalogStepMessage(step);
    case "peer-dependency-renamed":
    case "spec-kept":
    case "local-package":
    case "override-names-package":
    case "setting-names-package":
    case "pattern-names-package":
    case "deep-target":
    case "old-package-path":
    case "old-peer-needed":
      return packageStepMessage(step);
    default:
      return assertNever(step);
  }
}
