/** The names of the files the migration reads, as the tools that own them look for them. */

export const SHELL_EXTENSIONS: ReadonlySet<string> = new Set([".sh", ".bash", ".zsh"]);
export const MAKEFILE_EXTENSION = ".mk";
export const YAML_EXTENSIONS: ReadonlySet<string> = new Set([".yml", ".yaml"]);
/** Makefiles, justfiles and Dockerfiles, by the names make, just and docker look for. */
export const MAKEFILE_NAMES: ReadonlySet<string> = new Set(["Makefile", "makefile", "GNUmakefile"]);
export const JUSTFILE_NAMES: ReadonlySet<string> = new Set(["justfile", "Justfile", ".justfile"]);
export const DOCKERFILE_NAMES: ReadonlySet<string> = new Set(["Dockerfile", "Containerfile"]);
/** Git hooks that husky runs; `.husky/_/` holds husky's own generated scripts. */
export const HUSKY_FOLDER = ".husky/";
export const HUSKY_INTERNALS = ".husky/_/";
export const NX_PROJECT_FILE = "project.json";
export const NX_WORKSPACE_FILE = "nx.json";
/** Jest's config in JSON; `jest.config.js` and the other scripts are source files. */
export const JEST_JSON_CONFIG_FILE = "jest.config.json";
/** The names Task looks for, `.dist` ones included. */
export const TASKFILE_NAMES: ReadonlySet<string> = new Set(
  ["Taskfile", "taskfile", "Taskfile.dist", "taskfile.dist"].flatMap((name) => [
    `${name}.yml`,
    `${name}.yaml`,
  ]),
);
export const PRE_COMMIT_FILES: ReadonlySet<string> = new Set([
  ".pre-commit-config.yaml",
  ".pre-commit-config.yml",
]);
/** lint-staged reads `.lintstagedrc` as JSON or YAML; YAML reads both. */
export const LINT_STAGED_YAML_FILES: ReadonlySet<string> = new Set([
  ".lintstagedrc",
  ".lintstagedrc.yaml",
  ".lintstagedrc.yml",
]);
export const LINT_STAGED_JSON_FILE = ".lintstagedrc.json";
export const SIMPLE_GIT_HOOKS_FILES: ReadonlySet<string> = new Set([
  ".simple-git-hooks.json",
  "simple-git-hooks.json",
]);
export const DENO_CONFIG_FILES: ReadonlySet<string> = new Set(["deno.json", "deno.jsonc"]);
/** Deno reads its import map from its config, or from a file that the config names. */
export const IMPORT_MAP_FILE = "import_map.json";
export const DEPENDABOT_FILES: ReadonlySet<string> = new Set([
  ".github/dependabot.yml",
  ".github/dependabot.yaml",
]);
export const WORKSPACE_FILE = "pnpm-workspace.yaml";
export const YARNRC_FILE_NAME = ".yarnrc.yml";
/** pnpm reads a manifest from `package.yaml` too. */
export const YAML_MANIFEST_FILES: ReadonlySet<string> = new Set(["package.yaml", "package.yml"]);
/** pnpm also reads a manifest from `package.json5`, a format the tool reports but does not read. */
export const JSON5_MANIFEST_FILE = "package.json5";
export const MANIFEST_FILE = "package.json";
/**
 * TypeScript's project configs by the names tsc and editors look for: `tsconfig.json`,
 * `jsconfig.json`, and the `tsconfig.build.json` kind that `--project` and `extends` name.
 */
export const PROJECT_CONFIG_NAME = /^[jt]sconfig(\.[^/]+)?\.json$/;
/** The package manager writes these again on install; their entries are not commands. */
export const LOCK_FILES: ReadonlySet<string> = new Set(["pnpm-lock.yaml", "yarn.lock", "bun.lock"]);

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot);
}
