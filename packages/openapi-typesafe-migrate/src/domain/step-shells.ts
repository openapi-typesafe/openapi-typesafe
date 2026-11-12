import type { Locate, ShellTextFindings } from "./command-migration.js";
import type { DocumentPath, DocumentString } from "./config-documents.js";
import { namesOriginalPackage } from "./package-names.js";

/**
 * A CI step can name the program that runs its script: GitHub Actions `shell: python` next to
 * `run`, or as `defaults.run.shell` of the job or the workflow; CircleCI `shell` next to
 * `command`, of the job, or of the executor the job runs on. A script for a program other than a
 * shell is code of that language, so the command migration leaves it as it is and reports it
 * when it names an old package.
 */

/** The key of a CI step or job that names the program its scripts go to. */
const STEP_SHELL_KEY = "shell";
/** GitHub Actions' default shell of a job or a workflow: `defaults.run.shell`. */
const DEFAULT_SHELL_PATH: readonly string[] = ["defaults", "run", STEP_SHELL_KEY];
/**
 * Shells whose scripts are command lines as the tool reads them: POSIX shells, PowerShell, cmd,
 * and the wrappers that run bash on Windows (`msys2 {0}` of setup-msys2, `wsl-bash {0}` of
 * setup-wsl).
 */
const COMMAND_LINE_SHELLS: ReadonlySet<string> = new Set([
  ...["sh", "bash", "dash", "ash", "zsh", "ksh"],
  ...["pwsh", "powershell", "cmd"],
  ...["msys2", "wsl-bash"],
]);
/** `env` runs the program after its options and assignments (`/usr/bin/env bash -e {0}`). */
const ENV_PROGRAM = "env";
/** The options of `env` that take the next word as their value. */
const ENV_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set(["-u", "--unset", "-C", "--chdir"]);
const OPTION_START = "-";
const ASSIGNMENT = "=";
const PATH_SEPARATOR_RE = /[/\\]/;
const WINDOWS_EXECUTABLE_RE = /\.exe$/i;
const WHITESPACE_RE = /\s+/;
/** CircleCI's top-level map of executors, each of which may name a `shell`. */
const EXECUTORS_KEY = "executors";
/** The keys of the path of an executor's shell: `executors`, the executor name, `shell`. */
const EXECUTOR_SHELL_PATH_LENGTH = 3;
/** The key of a CircleCI job that names its executor: `executor: py`. */
const EXECUTOR_KEY = "executor";
/** The key of the executor name in the map form: `executor: { name: py }`. */
const EXECUTOR_NAME_KEY = "name";

/** The `shell` of the step that a script belongs to, when it is not a shell. */
export type StepShellOf = (value: DocumentString) => string | undefined;

/** The name of a program word: `bash` of `/usr/bin/bash` and of `C:\msys64\bin\bash.exe`. */
const programName = (word: string): string =>
  (word.split(PATH_SEPARATOR_RE).at(-1) ?? "").replace(WINDOWS_EXECUTABLE_RE, "");

/** The number of words after `env` before its program: options, their values, assignments. */
function envPrefixLength(words: readonly string[]): number {
  let index = 0;
  while (index < words.length) {
    const word = words[index] ?? "";
    if (ENV_OPTIONS_WITH_VALUE.has(word)) {
      index += 2;
    } else if (word.startsWith(OPTION_START) || word.includes(ASSIGNMENT)) {
      index += 1;
    } else {
      break;
    }
  }
  return index;
}

/** The program of a `shell` value (`python`, `bash -e {0}`, `/usr/bin/env bash -e {0}`). */
function shellProgram(shell: string): string {
  const words = shell.trim().split(WHITESPACE_RE);
  const first = programName(words[0] ?? "");
  if (first !== ENV_PROGRAM) {
    return first;
  }
  const rest = words.slice(1);
  return programName(rest[envPrefixLength(rest)] ?? "");
}

/** Whether a `shell` value or a shebang runs a shell whose scripts the tool reads as commands. */
export const isCommandLineShell = (shell: string): boolean =>
  COMMAND_LINE_SHELLS.has(shellProgram(shell));

/** Whether a document path ends with `keys`. */
const endsWith = (path: DocumentPath, keys: readonly string[]): boolean =>
  keys.every((key, index) => path[path.length - keys.length + index] === key);

const isDefaultShell = (value: DocumentString): boolean => endsWith(value.path, DEFAULT_SHELL_PATH);

/**
 * The map whose scripts a `shell` value is for, as a key: the step or job of a `shell` key, the
 * job or workflow of `defaults.run.shell`.
 */
function scopeOf(value: DocumentString): string {
  const keys = isDefaultShell(value) ? DEFAULT_SHELL_PATH.length : 1;
  return JSON.stringify(value.path.slice(0, -keys));
}

/** The `shell` of each CircleCI executor (`executors.py.shell`), by executor name. */
function executorShells(shells: readonly DocumentString[]): ReadonlyMap<string, string> {
  const isExecutorShell = ({ path }: DocumentString): boolean =>
    path.length === EXECUTOR_SHELL_PATH_LENGTH && path[0] === EXECUTORS_KEY;
  return new Map(
    shells.filter(isExecutorShell).map((shell) => [String(shell.path[1]), shell.value]),
  );
}

/** The path of the job that a CircleCI `executor` value belongs to, or undefined. */
function executorJob({ path }: DocumentString): DocumentPath | undefined {
  if (path.at(-1) === EXECUTOR_KEY) {
    return path.slice(0, -1);
  }
  const isNamed = path.at(-1) === EXECUTOR_NAME_KEY && path.at(-2) === EXECUTOR_KEY;
  return isNamed ? path.slice(0, -2) : undefined;
}

/**
 * The shells that CircleCI jobs take from their executor, by the scope of the job. A job's own
 * `shell` goes after these and wins.
 */
function inheritedShells(strings: readonly DocumentString[], shells: readonly DocumentString[]) {
  const byExecutor = executorShells(shells);
  return strings.flatMap((value): [string, string][] => {
    const job = executorJob(value);
    const shell = byExecutor.get(value.value);
    return job === undefined || shell === undefined ? [] : [[JSON.stringify(job), shell]];
  });
}

/**
 * The shell that a command value runs with, when it is a program other than a shell
 * (`shell: python`): the nearest `shell` above the value, of its step, its job, its executor, or
 * a default of the job or the workflow. A step's own `shell` wins over a default of the same map.
 */
export function stepShells(strings: readonly DocumentString[]): StepShellOf {
  const shells = strings.filter((value) => value.path.at(-1) === STEP_SHELL_KEY);
  const isOwnShell = (value: DocumentString): boolean => !isDefaultShell(value);
  // Later entries win: the own `shell` of a map goes after a default of the same map.
  const ordered = [...shells.filter(isDefaultShell), ...shells.filter(isOwnShell)];
  const byScope = new Map([
    ...inheritedShells(strings, shells),
    ...ordered.map((value): [string, string] => [scopeOf(value), value.value]),
  ]);
  return (value) => {
    for (let depth = value.path.length - 1; depth >= 0; depth -= 1) {
      const shell = byScope.get(JSON.stringify(value.path.slice(0, depth)));
      if (shell !== undefined) {
        return isCommandLineShell(shell) ? undefined : shell;
      }
    }
    return undefined;
  };
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
