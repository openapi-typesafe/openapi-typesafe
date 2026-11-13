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

/**
 * CI configs by the names and folders their services read: a top-level `openapi:` there is a job
 * (GitLab names jobs freely), never an API description.
 */
const CI_CONFIG_FILES: ReadonlySet<string> = new Set([
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml",
  "bitbucket-pipelines.yml",
  ".drone.yml",
  ".woodpecker.yml",
  ".travis.yml",
]);
const CI_CONFIG_FOLDERS: readonly string[] = [
  ".github/workflows/",
  ".gitea/workflows/",
  ".forgejo/workflows/",
  ".circleci/",
  ".gitlab/",
  ".woodpecker/",
];
const FOLDER_SEPARATOR = "/";

/** Whether a path is in a folder of that name, also in a nested project. */
export const isInFolder = (path: string, folder: string): boolean =>
  path.startsWith(folder) || path.includes(`${FOLDER_SEPARATOR}${folder}`);

/**
 * Azure Pipelines files by the names projects give them: `azure-pipelines.yml`, a named one
 * (`ci.azure-pipelines.yml`, `azure-pipelines-release.yaml`), and any file in `.azure-pipelines/`
 * or `.azuredevops/`. Azure reads the file a pipeline names, whatever its name.
 */
const AZURE_PIPELINES_FILE_RE = /^(?:[^/]+[.-])?azure-pipelines(?:[.-][^/]+)?\.ya?ml$/;
const AZURE_PIPELINES_FOLDERS: readonly string[] = [".azure-pipelines/", ".azuredevops/"];

export function isAzurePipelinesFile(path: string): boolean {
  const isInAzureFolder = AZURE_PIPELINES_FOLDERS.some((folder) => isInFolder(path, folder));
  return AZURE_PIPELINES_FILE_RE.test(baseName(path)) || isInAzureFolder;
}

/** Whether a path is a CI config, also in a nested project (`apps/api/.gitlab-ci.yml`). */
export function isCiConfigFile(path: string): boolean {
  const inFolder = (folder: string): boolean => isInFolder(path, folder);
  const isNamed = CI_CONFIG_FILES.has(baseName(path)) || isAzurePipelinesFile(path);
  return isNamed || CI_CONFIG_FOLDERS.some(inFolder);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot);
}
