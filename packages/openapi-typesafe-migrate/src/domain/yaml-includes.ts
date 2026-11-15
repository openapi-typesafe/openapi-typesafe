import type { DocumentPath, DocumentString } from "./config-documents.js";
import { referencedProjectPath } from "./relative-references.js";

/**
 * The files that a YAML file includes, as its tool reads them: a Taskfile's `includes`, a GitLab
 * CI `include` of a local file, an Azure Pipelines `template`. The tool reads an included file
 * as a part of the file that includes it, so it is migrated as a file of the same kind whatever
 * its name (application/yaml-file-reach.ts).
 */
export interface YamlIncludes {
  /** Whether the value at `path` names an included file. */
  readonly isIncludeAt: (path: DocumentPath) => boolean;
  /** Whether a path as written is from the project root, not from the including file's folder. */
  readonly isFromRoot: (reference: string) => boolean;
  /**
   * The key path of the variables that the include whose file the value at `path` names gives
   * that file (a Taskfile include's `vars`); none when the tool's includes give none.
   */
  readonly variablesPath?: (path: DocumentPath) => DocumentPath;
}

const ROOT_PREFIX = "/";
/**
 * A path that the tool computes (`$CI_DIR/gen.yml`, `{{.OS}}.yml`) or a URL. A path of another
 * repository (`gen.yml@templates`) does not end as a YAML file does.
 */
const NOT_A_PROJECT_PATH_RE = /\{\{|\$|^[a-z][a-z\d+.-]*:/i;
const LEADING_ROOT_RE = /^\/+/;
const YAML_FILE_RE = /\.ya?ml$/;

export const NO_INCLUDES: YamlIncludes = {
  isIncludeAt: () => false,
  isFromRoot: () => false,
};

const TASKFILE_INCLUDES_KEY = "includes";
const TASKFILE_KEY = "taskfile";
const TASKFILE_VARS_KEY = "vars";
/** `includes` and the include's name: the start of the key path of all its fields. */
const INCLUDE_PATH_LENGTH = 2;

/**
 * Task `includes: { gen: ./tasks/gen.yml }`, also `{ taskfile: …, vars: { GEN: … } }`, from the
 * file's folder. The `vars` of an include are variables of the file it includes there.
 */
export const TASKFILE_INCLUDES: YamlIncludes = {
  isIncludeAt: ([key, name, field]) =>
    key === TASKFILE_INCLUDES_KEY &&
    typeof name === "string" &&
    (field === undefined || field === TASKFILE_KEY),
  isFromRoot: () => false,
  variablesPath: (path) => [...path.slice(0, INCLUDE_PATH_LENGTH), TASKFILE_VARS_KEY],
};

const GITLAB_INCLUDE_KEY = "include";
const GITLAB_LOCAL_KEY = "local";

/**
 * GitLab `include: gen.yml`, `include: [gen.yml]` and `include: { local: gen.yml }`, in a list
 * too: a local include names a file from the project root, with or without a leading `/`.
 */
export const GITLAB_INCLUDES: YamlIncludes = {
  isIncludeAt: ([key, ...rest]) => {
    const [first] = typeof rest[0] === "number" ? rest.slice(1) : rest;
    const isLocal = first === undefined || first === GITLAB_LOCAL_KEY;
    return key === GITLAB_INCLUDE_KEY && isLocal;
  },
  isFromRoot: () => true,
};

const AZURE_TEMPLATE_KEY = "template";

/** Azure Pipelines `- template: gen.yml` of any part, from the file's folder or from `/`. */
export const AZURE_TEMPLATES: YamlIncludes = {
  isIncludeAt: (path) => path.at(-1) === AZURE_TEMPLATE_KEY,
  isFromRoot: (reference) => reference.startsWith(ROOT_PREFIX),
};

/** A file that an include names, and the variables that the include gives it, by name. */
export interface IncludedFile {
  readonly path: string;
  readonly variables: ReadonlyMap<string, string>;
}

/** The string variables of the map at `path` (`vars: { GEN: grep }`); a computed one is none. */
function variablesAt(
  strings: readonly DocumentString[],
  path: DocumentPath | undefined,
): Map<string, string> {
  const map = JSON.stringify(path);
  const variables = strings.filter(
    (string) => path !== undefined && JSON.stringify(string.path.slice(0, -1)) === map,
  );
  return new Map(variables.map((string) => [String(string.path.at(-1)), string.value]));
}

/**
 * The project paths of the YAML files that the file at `fromPath` includes, with the variables
 * that each include gives. GitLab may name several files with `*` and `**`, which stay in the
 * path for the caller to match.
 */
export function includedFiles(
  fromPath: string,
  strings: readonly DocumentString[],
  includes: YamlIncludes,
): IncludedFile[] {
  return strings.flatMap((string) => {
    const reference = string.value.trim();
    if (!includes.isIncludeAt(string.path) || NOT_A_PROJECT_PATH_RE.test(reference)) {
      return [];
    }
    const path = includes.isFromRoot(reference)
      ? referencedProjectPath("", reference.replace(LEADING_ROOT_RE, ""))
      : referencedProjectPath(fromPath, reference);
    const variables = variablesAt(strings, includes.variablesPath?.(string.path));
    return path !== undefined && YAML_FILE_RE.test(path) ? [{ path, variables }] : [];
  });
}

/** The project paths of the YAML files that the file at `fromPath` includes. */
export const includedPaths = (
  fromPath: string,
  strings: readonly DocumentString[],
  includes: YamlIncludes,
): string[] => includedFiles(fromPath, strings, includes).map(({ path }) => path);
