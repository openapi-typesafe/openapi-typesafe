import { assertNever } from "../domain/assert-never.js";
import type { ManualStep } from "../domain/migration-findings.js";
import { FLAG_RENAMES, PACKAGE_RENAMES } from "../domain/package-names.js";

/** The user-facing text of the manual steps found in commands (CODING_PRINCIPLES 7.8). */

const PINNED_NOTE = "change it to openapi-typesafe@<version>";
const OLD_FILE_NOTE =
  "is a file of openapi-typescript, which is no longer installed: run openapi-typesafe instead";
const FLAGS_IN_VARIABLE_NOTE =
  "holds old flags of the generator and may serve other commands, so it was kept: rename";
const NOT_ONLY_GENERATOR_NOTE =
  "runs openapi-typescript in some of its definitions in this file and another program in " +
  "others, so the flags after it were kept; where it runs the generator, rename";
const OLD_NAME_IN_COMMAND_NOTE =
  "names an old package where the tool cannot tell what runs it (a script name, an argument of " +
  "a program it does not know), so it was kept: migrate it by hand";
const COMMAND_STRING_NOTE = "a string runs openapi-typescript, so it was kept; change it to";

function pinnedPackageMessage(step: Extract<ManualStep, { kind: "pinned-package" }>): string {
  const successor = PACKAGE_RENAMES.get(step.name) ?? step.name;
  return (
    `${step.location} names a pinned ${step.name}@<version>: ` +
    `change it to ${successor}@<version>`
  );
}

/** `-it to --immutable, …`: each old flag with its new name. */
const flagRenames = (flags: readonly string[]): string =>
  flags.map((flag) => `${flag} to ${FLAG_RENAMES.get(flag) ?? flag}`).join(", ");

function flagsInVariableMessage(step: Extract<ManualStep, { kind: "flags-in-variable" }>) {
  return `${step.location}: ${step.variable} ${FLAGS_IN_VARIABLE_NOTE} ${flagRenames(step.flags)}`;
}

function notOnlyGeneratorMessage(
  step: Extract<ManualStep, { kind: "variable-not-only-generator" }>,
): string {
  return `${step.location}: ${step.variable} ${NOT_ONLY_GENERATOR_NOTE} ${flagRenames(step.flags)}`;
}

/** The manual steps found in commands: scripts, shell files, CI files and command strings. */
type CommandStep = Extract<
  ManualStep,
  {
    kind:
      | "versioned-command"
      | "flags-in-variable"
      | "variable-not-only-generator"
      | "pinned-package"
      | "old-package-file"
      | "old-name-in-command"
      | "command-string";
  }
>;

const COMMAND_STEP_KINDS: ReadonlySet<ManualStep["kind"]> = new Set([
  "versioned-command",
  "flags-in-variable",
  "variable-not-only-generator",
  "pinned-package",
  "old-package-file",
  "old-name-in-command",
  "command-string",
]);

export const isCommandStep = (step: ManualStep): step is CommandStep =>
  COMMAND_STEP_KINDS.has(step.kind);

export function commandStepMessage(step: CommandStep): string {
  switch (step.kind) {
    case "versioned-command":
      return `${step.location} runs a pinned openapi-typescript@<version>: ${PINNED_NOTE}`;
    case "flags-in-variable":
      return flagsInVariableMessage(step);
    case "variable-not-only-generator":
      return notOnlyGeneratorMessage(step);
    case "pinned-package":
      return pinnedPackageMessage(step);
    case "old-package-file":
      return `${step.location}: ${step.path} ${OLD_FILE_NOTE}`;
    case "old-name-in-command":
      return `${step.location}: "${step.word}" ${OLD_NAME_IN_COMMAND_NOTE}`;
    case "command-string":
      return `line ${step.line}: ${COMMAND_STRING_NOTE} "${step.to}"`;
    default:
      return assertNever(step);
  }
}
