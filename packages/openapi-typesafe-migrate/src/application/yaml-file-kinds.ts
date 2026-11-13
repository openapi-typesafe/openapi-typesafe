import {
  AZURE_PIPELINES_FILE,
  CI_ENVIRONMENT_FILE,
  COMPOSE_FILE,
  DEFAULT_YAML_FILE,
  GITLAB_CI_FILE,
  type YamlCommandFile,
} from "../domain/yaml-environments.js";
import { baseName, isAzurePipelinesFile, isInFolder } from "./project-file-names.js";

/**
 * The kind of a YAML command file by the names and folders its tool reads, so that the variables
 * it sets (GitLab and Azure `variables`, CircleCI and Compose `environment`) are read in that
 * file only: the same keys mean other things in other files.
 */

const GITLAB_FILES: ReadonlySet<string> = new Set([".gitlab-ci.yml", ".gitlab-ci.yaml"]);
const GITLAB_FOLDER = ".gitlab/";
const CI_ENVIRONMENT_FILES: ReadonlySet<string> = new Set([
  ".drone.yml",
  ".drone.yaml",
  ".woodpecker.yml",
  ".woodpecker.yaml",
]);
const CI_ENVIRONMENT_FOLDERS: readonly string[] = [".circleci/", ".woodpecker/"];
/** `compose.yaml`, `docker-compose.yml` and their overrides (`compose.override.yaml`). */
const COMPOSE_FILE_RE = /^(?:docker-)?compose(?:\.[^/]+)?\.ya?ml$/;

/** The YAML command file kind of a path. */
export function yamlCommandFileFor(path: string): YamlCommandFile {
  const name = baseName(path);
  if (GITLAB_FILES.has(name) || isInFolder(path, GITLAB_FOLDER)) {
    return GITLAB_CI_FILE;
  }
  const isCiEnvironment = CI_ENVIRONMENT_FOLDERS.some((folder) => isInFolder(path, folder));
  if (CI_ENVIRONMENT_FILES.has(name) || isCiEnvironment) {
    return CI_ENVIRONMENT_FILE;
  }
  if (isAzurePipelinesFile(path)) {
    return AZURE_PIPELINES_FILE;
  }
  return COMPOSE_FILE_RE.test(name) ? COMPOSE_FILE : DEFAULT_YAML_FILE;
}
