import { assertNever } from "../domain/assert-never.js";
import type { ManualStep, TransformKeepReason } from "../domain/migration-findings.js";
import { FLAG_RENAMES, PACKAGE_RENAMES } from "../domain/package-names.js";

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
};

const PEER_NOTE = "users of this package must switch too (a breaking change for them)";
const PINNED_NOTE = "change it to openapi-typesafe@<version>";
const OLD_FILE_NOTE =
  "is a file of openapi-typescript, which is no longer installed: run openapi-typesafe instead";
const FLAGS_IN_VARIABLE_NOTE =
  "holds old flags of the generator and may serve other commands, so it was kept: rename";
const COMMAND_STRING_NOTE = "a string runs openapi-typescript, so it was kept; change it to";
const OPTIONS_NOTE =
  "the options of openapiTS() are not an object written in this file: check them for " +
  `transform, postTransform and transformProperty. See ${IR_CALLBACKS_GUIDE}`;
const MANIFEST_NOT_READ_NOTE =
  "is a JSON5 manifest, which the tool does not read: rename the packages and the generator " +
  "command by hand, or write it as package.json and run the tool again";
const DEEP_IMPORT_NOTE = "imports a file inside the package; check that it exists";
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

function pinnedPackageMessage(step: Extract<ManualStep, { kind: "pinned-package" }>): string {
  const successor = PACKAGE_RENAMES.get(step.name) ?? step.name;
  return (
    `${step.location} names a pinned ${step.name}@<version>: ` +
    `change it to ${successor}@<version>`
  );
}

function flagsInVariableMessage(step: Extract<ManualStep, { kind: "flags-in-variable" }>) {
  const renames = step.flags.map((flag) => `${flag} to ${FLAG_RENAMES.get(flag) ?? flag}`);
  return `${step.location}: ${step.variable} ${FLAGS_IN_VARIABLE_NOTE} ${renames.join(", ")}`;
}

/** The manual steps found in commands: scripts, shell files, CI files and command strings. */
type CommandStep = Extract<
  ManualStep,
  {
    kind:
      | "versioned-command"
      | "flags-in-variable"
      | "pinned-package"
      | "old-package-file"
      | "command-string";
  }
>;

const COMMAND_STEP_KINDS: ReadonlySet<ManualStep["kind"]> = new Set([
  "versioned-command",
  "flags-in-variable",
  "pinned-package",
  "old-package-file",
  "command-string",
]);

const isCommandStep = (step: ManualStep): step is CommandStep => COMMAND_STEP_KINDS.has(step.kind);

function commandStepMessage(step: CommandStep): string {
  switch (step.kind) {
    case "versioned-command":
      return `${step.location} runs a pinned openapi-typescript@<version>: ${PINNED_NOTE}`;
    case "flags-in-variable":
      return flagsInVariableMessage(step);
    case "pinned-package":
      return pinnedPackageMessage(step);
    case "old-package-file":
      return `${step.location}: ${step.path} ${OLD_FILE_NOTE}`;
    case "command-string":
      return `line ${step.line}: ${COMMAND_STRING_NOTE} "${step.to}"`;
    default:
      return assertNever(step);
  }
}

/** Steps for places of a structured file (JSON, YAML) that the tool could not edit. */
type UneditedStep = Extract<
  ManualStep,
  {
    kind:
      | "config-unreadable"
      | "manifest-not-read"
      | "entry-not-edited"
      | "name-collision"
      | "catalog-reference-kept"
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
    case "entry-not-edited":
      return `${step.field}: ${step.name} has a value the tool does not read; rename it by hand`;
    case "name-collision":
      return (
        `${step.field} has both ${step.from} and ${step.to}, so ${step.from} was kept: ` +
        "remove one of them"
      );
    case "catalog-reference-kept":
      return (
        `${step.field}: ${step.name} was kept, because catalog "${step.catalog}" keeps ` +
        `${step.name}: rename the entry and the dependency together`
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

export function manualStepMessage(step: ManualStep): string {
  if (isCommandStep(step)) {
    return commandStepMessage(step);
  }
  switch (step.kind) {
    case "config-unreadable":
    case "manifest-not-read":
    case "entry-not-edited":
    case "name-collision":
    case "catalog-reference-kept":
    case "catalog-entry-in-use":
      return uneditedStepMessage(step);
    case "peer-dependency-renamed":
      return `${step.name} is a peer dependency: ${PEER_NOTE}`;
    case "spec-kept":
      return `${step.name} kept the spec "${step.spec}": point it at an openapi-typesafe version`;
    case "override-names-package":
      return `"${step.field}" names ${step.name}: update or remove that override`;
    case "options-not-inspected":
    case "deep-import":
    case "dynamic-specifier":
    case "string-names-package":
    case "transform-not-rewritten":
    case "legacy-callback":
    case "package-not-declared":
      return sourceStepMessage(step);
    case "old-peer-needed":
      return oldPeerMessage(step);
    default:
      return assertNever(step);
  }
}
