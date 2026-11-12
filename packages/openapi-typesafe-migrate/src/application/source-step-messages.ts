import { assertNever } from "../domain/assert-never.js";
import type { ManualStep, TransformKeepReason } from "../domain/migration-findings.js";

/** The user-facing text of the manual steps found in source files (CODING_PRINCIPLES 7.8). */

// The same guide the generator links in its deprecation warning.
const IR_CALLBACKS_GUIDE =
  "https://github.com/openapi-typesafe/openapi-typesafe/blob/main/docs/node.md#ir-callbacks";

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
  "spread-options":
    "its options take keys from another object (`...base`), whose callbacks and type the tool " +
    "cannot see",
  "declared-type":
    "its declared type (a `const` type, JSDoc `@type` or `@returns`) names a type the tool " +
    "cannot change to type text",
};
const OPTIONS_NOTE =
  "the options of openapiTS() are not an object written in this file: check them for " +
  `transform, postTransform and transformProperty. See ${IR_CALLBACKS_GUIDE}`;
const DEEP_IMPORT_NOTE = "imports a file inside the package; check that it exists";
const OLD_FILE_NOTE = "imports a file from node_modules of";
const OLD_FILE_FIX_NOTE = "which is no longer installed: import from";
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

/** Steps for a line of a source file. */
export type SourceStep = Extract<
  ManualStep,
  {
    kind:
      | "options-not-inspected"
      | "deep-import"
      | "old-package-import"
      | "dynamic-specifier"
      | "string-names-package"
      | "transform-not-rewritten"
      | "legacy-callback"
      | "package-not-declared";
  }
>;

const SOURCE_STEP_KINDS: ReadonlySet<ManualStep["kind"]> = new Set([
  "options-not-inspected",
  "deep-import",
  "old-package-import",
  "dynamic-specifier",
  "string-names-package",
  "transform-not-rewritten",
  "legacy-callback",
  "package-not-declared",
]);

export const isSourceStep = (step: ManualStep): step is SourceStep =>
  SOURCE_STEP_KINDS.has(step.kind);

export function sourceStepMessage(step: SourceStep): string {
  switch (step.kind) {
    case "options-not-inspected":
      return `line ${step.line}: ${OPTIONS_NOTE}`;
    case "deep-import":
      return `line ${step.line}: "${step.specifier}" ${DEEP_IMPORT_NOTE}`;
    case "old-package-import":
      return (
        `line ${step.line}: "${step.specifier}" ${OLD_FILE_NOTE} ${step.name}, ` +
        `${OLD_FILE_FIX_NOTE} ${step.to}`
      );
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
