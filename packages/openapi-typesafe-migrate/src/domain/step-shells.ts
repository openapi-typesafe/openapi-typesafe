import type { Locate, ShellTextFindings } from "./command-migration.js";
import type { DocumentString } from "./config-documents.js";
import { namesOriginalPackage } from "./package-names.js";

/**
 * A CI step can name the program that runs its script: GitHub Actions `shell: python` next to
 * `run`, CircleCI `shell` next to `command`. A script for a program other than a shell is code
 * of that language, so the command migration leaves it as it is and reports it when it names an
 * old package.
 */

/** The key of a CI step that names the program its script goes to. */
const STEP_SHELL_KEY = "shell";
/** Shells whose scripts are command lines as the tool reads them: POSIX shells, PowerShell, cmd. */
const COMMAND_LINE_SHELLS: ReadonlySet<string> = new Set([
  ...["sh", "bash", "dash", "ash", "zsh", "ksh"],
  ...["pwsh", "powershell", "cmd"],
]);
const PATH_SEPARATOR_RE = /[/\\]/;
const WHITESPACE_RE = /\s+/;

/** The `shell` of the step that a script belongs to, when it is not a shell. */
export type StepShellOf = (value: DocumentString) => string | undefined;

/** The program of a `shell` value (`python`, `bash -e {0}`, `/usr/bin/perl {0}`). */
const shellProgram = (shell: string): string =>
  shell.trim().split(WHITESPACE_RE)[0]?.split(PATH_SEPARATOR_RE).at(-1) ?? "";

/**
 * The `shell` of the step that a command value belongs to (a value next to it), when it is a
 * program other than a shell (`shell: python`).
 */
export function stepShells(strings: readonly DocumentString[]): StepShellOf {
  const stepOf = (path: DocumentString["path"]) => JSON.stringify(path.slice(0, -1));
  const others = new Map(
    strings
      .filter((value) => value.path.at(-1) === STEP_SHELL_KEY)
      .filter((value) => !COMMAND_LINE_SHELLS.has(shellProgram(value.value)))
      .map((value) => [stepOf(value.path), value.value]),
  );
  return (value) => others.get(stepOf(value.path));
}

/** A script of a step with another program as its shell that names an old package. */
export function otherShellFindings(
  values: readonly DocumentString[],
  shellOf: StepShellOf,
  locate: Locate,
): ShellTextFindings {
  const manualSteps = values.flatMap((value) => {
    const shell = shellOf(value);
    return shell === undefined || !namesOriginalPackage(value.value)
      ? []
      : [{ kind: "script-not-shell", location: locate(value.start), shell } as const];
  });
  return { edits: [], changes: [], manualSteps };
}
