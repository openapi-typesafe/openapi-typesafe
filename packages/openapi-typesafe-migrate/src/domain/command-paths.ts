import type { DocumentPath } from "./config-documents.js";

/**
 * Where configs keep commands, as key path patterns: package.json scripts and the hook tools it
 * configures, Nx targets, Deno tasks and lint-staged. Only the strings at these paths are read as
 * commands, so the other values of a config stay as written.
 */

/** A key path pattern; `*` matches any key or index. */
export type CommandPathPattern = readonly string[];

const ANY = "*";

/** The `command` and `commands` of `nx:run-commands` options under `prefix`. */
const nxOptionPaths = (prefix: CommandPathPattern): CommandPathPattern[] => [
  [...prefix, "command"],
  [...prefix, "commands", ANY],
  [...prefix, "commands", ANY, "command"],
];

/**
 * `nx:run-commands` targets under `prefix`: `command`, the commands of `options`, and those of
 * each of its `configurations`, which replace the options they name (`nx run app:gen:ci`).
 */
const nxTargetPaths = (prefix: CommandPathPattern): CommandPathPattern[] => [
  [...prefix, ANY, "command"],
  ...nxOptionPaths([...prefix, ANY, "options"]),
  ...nxOptionPaths([...prefix, ANY, "configurations", ANY]),
];

/** lint-staged: each glob runs a command or a list of them. */
const lintStagedPaths = (prefix: CommandPathPattern): CommandPathPattern[] => [
  [...prefix, ANY],
  [...prefix, ANY, ANY],
];

/** simple-git-hooks: each git hook runs one command. */
const simpleGitHooksPaths = (prefix: CommandPathPattern): CommandPathPattern[] => [
  [...prefix, ANY],
];

/** Nx `project.json` targets. */
export const NX_PROJECT_COMMAND_PATHS: readonly CommandPathPattern[] = nxTargetPaths(["targets"]);

/** `nx.json`: the defaults of the targets, by target name or executor. */
export const NX_WORKSPACE_COMMAND_PATHS: readonly CommandPathPattern[] = nxTargetPaths([
  "targetDefaults",
]);

/**
 * A manifest (package.json, package.yaml): the scripts, the configs of simple-git-hooks and
 * lint-staged, and the Nx targets of the project. Each finding names its place (`scripts.gen`).
 */
export const MANIFEST_COMMAND_PATHS: readonly CommandPathPattern[] = [
  ["scripts", ANY],
  ...simpleGitHooksPaths(["simple-git-hooks"]),
  ...lintStagedPaths(["lint-staged"]),
  ...nxTargetPaths(["nx", "targets"]),
];

/** A lint-staged config file (`.lintstagedrc`, `.lintstagedrc.json`, …). */
export const LINT_STAGED_COMMAND_PATHS: readonly CommandPathPattern[] = lintStagedPaths([]);

/** A simple-git-hooks config file (`.simple-git-hooks.json`, …). */
export const SIMPLE_GIT_HOOKS_COMMAND_PATHS: readonly CommandPathPattern[] = simpleGitHooksPaths(
  [],
);

/** Deno tasks: a command string, or an object with a `command`. */
export const DENO_TASK_PATHS: readonly CommandPathPattern[] = [
  ["tasks", ANY],
  ["tasks", ANY, "command"],
];

const matches = (path: DocumentPath, pattern: CommandPathPattern): boolean =>
  path.length === pattern.length &&
  pattern.every((part, index) => part === ANY || part === String(path[index]));

/** Whether a value at `path` is a command by one of `patterns`. */
export const isCommandPath = (
  path: DocumentPath,
  patterns: readonly CommandPathPattern[],
): boolean => patterns.some((pattern) => matches(path, pattern));
