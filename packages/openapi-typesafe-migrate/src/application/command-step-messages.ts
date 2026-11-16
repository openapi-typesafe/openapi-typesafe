import { assertNever } from "../domain/assert-never.js";
import type { ContainerUnknown, IncludeProblem, ManualStep } from "../domain/migration-findings.js";
import { FLAG_RENAMES, PACKAGE_RENAMES } from "../domain/package-names.js";

/** The user-facing text of the manual steps found in commands (CODING_PRINCIPLES 7.8). */

const PINNED_NOTE = "change it to openapi-typesafe@<version>";
const OLD_FILE_NOTE =
  "is a file of openapi-typescript, which is no longer installed: run openapi-typesafe instead";
const FLAGS_IN_VARIABLE_NOTE =
  "holds old flags of the generator and may serve other commands, so it was kept: rename";
const NOT_ONLY_GENERATOR_NOTE =
  "may run openapi-typescript or another program (set elsewhere in the file, in another " +
  "step or outside it), so the flags after it were kept; where it runs the generator, rename";
const OLD_NAME_IN_COMMAND_NOTE =
  "names an old package where the tool cannot tell what runs it (a script name, an argument of " +
  "a program it does not know), so it was kept: migrate it by hand";
const SCRIPT_NOT_SHELL_NOTE =
  "so the tool does not read it as commands: migrate the old package names in it by hand";
const COMMAND_STRING_NOTE = "a string runs openapi-typescript, so it was kept; change it to";
const SHARED_CONTAINER_TEXT_NOTE =
  "is shared by containers that run different programs (through a YAML anchor or a Compose " +
  "extends), so it was kept: where it runs the generator, rename";
const INCLUDED_TEXT_DIFFERS_NOTE =
  "read this line with different values (it may run openapi-typescript in one and another " +
  "program in another), so it was kept: where it runs the generator, rename";
const COMMAND_LINE_IN_ITEM_NOTE =
  "a list item holds a whole command line, which no shell splits in exec form, so it was kept: " +
  "where a shell runs it, rename";
const CONTAINER_NOT_KNOWN_NOTES: Readonly<Record<ContainerUnknown, string>> = {
  "image-program":
    "gives these arguments to the program of its image, which the file does not name, so they " +
    "were kept: where they run the generator, rename",
  "other-file":
    "is a service whose entrypoint or command another Compose file may set (an override file, " +
    "a file given with -f, or the file its extends names), so it was kept: where it runs the " +
    "generator, rename",
};
const INCLUDE_NOT_READ_NOTES: Readonly<Record<IncludeProblem, string>> = {
  "not-in-project":
    "which the tool cannot read (it is missing, outside the project, remote or named by a " +
    "variable): migrate the old package names in it by hand",
  cycle:
    "which includes this file again, a cycle that Compose rejects: remove one of the includes, " +
    "then run the tool again",
};
const includeNote = (problem: IncludeProblem): string => INCLUDE_NOT_READ_NOTES[problem];
const SERVICE_CONFLICT_NOTE =
  "is also defined by a file that this Compose file includes, which Compose rejects, so its " +
  "container was kept: keep one of them, then run the tool again";
const SPLIT_FLAG_NOTE =
  "is an old flag of the generator that quotes split where it is written, so it was kept: rename";

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

function containerNotKnownMessage(
  step: Extract<ManualStep, { kind: "container-not-known" }>,
): string {
  const renames = step.renames.map(({ from, to }) => `${from} to ${to}`).join(", ");
  return `${step.location}: the container ${CONTAINER_NOT_KNOWN_NOTES[step.unknown]} ${renames}`;
}

function flagsInVariableMessage(step: Extract<ManualStep, { kind: "flags-in-variable" }>) {
  return `${step.location}: ${step.variable} ${FLAGS_IN_VARIABLE_NOTE} ${flagRenames(step.flags)}`;
}

function notOnlyGeneratorMessage(
  step: Extract<ManualStep, { kind: "variable-not-only-generator" }>,
): string {
  return `${step.location}: ${step.variable} ${NOT_ONLY_GENERATOR_NOTE} ${flagRenames(step.flags)}`;
}

/** The steps that keep a text which some of its readers run as the generator, with renames. */
type RenameStep = Extract<
  ManualStep,
  { kind: "shared-container-text" | "included-text-differs" | "command-line-in-item" }
>;

/** Why a rename step's text was kept. */
function keptReason(step: RenameStep): string {
  switch (step.kind) {
    case "shared-container-text":
      return `the text ${SHARED_CONTAINER_TEXT_NOTE}`;
    case "included-text-differs":
      return `the Makefiles ${step.readers.join(", ")} ${INCLUDED_TEXT_DIFFERS_NOTE}`;
    case "command-line-in-item":
      return COMMAND_LINE_IN_ITEM_NOTE;
    default:
      return assertNever(step);
  }
}

function renameStepMessage(step: RenameStep): string {
  const renames = step.renames.map(({ from, to }) => `${from} to ${to}`).join(", ");
  return `${step.location}: ${keptReason(step)} ${renames}`;
}

function composeStepMessage(
  step: Extract<ManualStep, { kind: "compose-include-not-read" | "compose-service-conflict" }>,
): string {
  return step.kind === "compose-include-not-read"
    ? `${step.location}: the file includes ${step.path}, ${includeNote(step.problem)}`
    : `${step.location}: the service ${step.service} ${SERVICE_CONFLICT_NOTE}`;
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
      | "split-flag"
      | "shared-container-text"
      | "included-text-differs"
      | "command-line-in-item"
      | "container-not-known"
      | "compose-include-not-read"
      | "compose-service-conflict"
      | "script-not-shell"
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
  "split-flag",
  "shared-container-text",
  "included-text-differs",
  "command-line-in-item",
  "container-not-known",
  "compose-include-not-read",
  "compose-service-conflict",
  "script-not-shell",
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
    case "split-flag":
      return `${step.location}: ${step.flag} ${SPLIT_FLAG_NOTE} ${flagRenames([step.flag])}`;
    case "shared-container-text":
    case "included-text-differs":
    case "command-line-in-item":
      return renameStepMessage(step);
    case "container-not-known":
      return containerNotKnownMessage(step);
    case "compose-include-not-read":
    case "compose-service-conflict":
      return composeStepMessage(step);
    case "script-not-shell":
      return `${step.location}: the script runs with ${step.shell}, ${SCRIPT_NOT_SHELL_NOTE}`;
    case "command-string":
      return `line ${step.line}: ${COMMAND_STRING_NOTE} "${step.to}"`;
    default:
      return assertNever(step);
  }
}
