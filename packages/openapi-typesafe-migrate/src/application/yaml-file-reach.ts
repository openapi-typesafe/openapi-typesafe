import { mayBeApiDescription } from "../domain/api-descriptions.js";
import { type DocumentString, usedDocumentStrings } from "../domain/config-documents.js";
import { namesOriginalPackage } from "../domain/package-names.js";
import { DEFAULT_YAML_FILE, TASKFILE, type YamlCommandFile } from "../domain/yaml-environments.js";
import { generatorVariables } from "../domain/yaml-generator-variables.js";
import { includedPaths, NO_INCLUDES } from "../domain/yaml-includes.js";
import type { DocumentReaders, ProjectFiles } from "./ports.js";
import {
  baseName,
  extensionOf,
  isCiConfigFile,
  TASKFILE_NAMES,
  YAML_EXTENSIONS,
} from "./project-file-names.js";
import { yamlCommandFileFor } from "./yaml-file-kinds.js";

/**
 * What the YAML files of a project give the other files, read before any file is migrated: the
 * kind of each file that a Taskfile, a GitLab CI file or an Azure pipeline includes under another
 * name, and the variables that YAML files set to the old generator, which the scripts their jobs
 * run may expand.
 */
export interface YamlReach {
  readonly kinds: ReadonlyMap<string, YamlCommandFile>;
  readonly generatorVariables: ReadonlySet<string>;
}

export const NO_YAML_REACH: YamlReach = { kinds: new Map(), generatorVariables: new Set() };

interface ReachDependencies {
  readonly files: ProjectFiles;
  readonly readers: DocumentReaders;
}

/** The YAML command file kind of a path: the kind of the file that includes it, or its own. */
export const yamlKindOf = (reach: YamlReach, path: string): YamlCommandFile =>
  reach.kinds.get(path) ?? yamlCommandFileFor(path);

/** The kind of a path by its name, Taskfiles included. */
const namedKindOf = (path: string): YamlCommandFile =>
  TASKFILE_NAMES.has(baseName(path)) ? TASKFILE : yamlCommandFileFor(path);

/** The text of a listed file, or undefined when it cannot be read. */
async function textOf(path: string, { files }: ReachDependencies): Promise<string | undefined> {
  const read = await files.read(path);
  return read.kind === "read" ? read.text : undefined;
}

/** The strings of a YAML text where they are used; none when it does not parse. */
function stringsOf(text: string | undefined, { readers }: ReachDependencies): DocumentString[] {
  const parsed = text === undefined ? undefined : readers.yaml.read(text);
  return parsed?.kind === "read" ? usedDocumentStrings(parsed.documents) : [];
}

const ANY_FOLDERS_WILDCARD = "**";
const WILDCARD_RE = /\*\*?/g;
const SPECIAL_CHARACTERS_RE = /[.+?^${}()|[\]\\]/g;
const ANY_FOLDERS = ".*";
const ANY_NAME = "[^/]*";

/** The listed paths that an included path names; GitLab reads `*` and `**` as wildcards. */
function matchingPaths(pattern: string, listed: readonly string[]): string[] {
  const source = pattern
    .replace(SPECIAL_CHARACTERS_RE, "\\$&")
    .replace(WILDCARD_RE, (star) => (star === ANY_FOLDERS_WILDCARD ? ANY_FOLDERS : ANY_NAME));
  const matches = new RegExp(`^${source}$`);
  return listed.filter((path) => matches.test(path));
}

/**
 * The kinds of the files that the files of `paths` include, followed through the files they
 * include in turn. A file that its name gives a kind keeps it. Only the files of a kind that
 * includes files are read.
 */
async function includedKinds(
  paths: readonly string[],
  dependencies: ReachDependencies,
): Promise<Map<string, YamlCommandFile>> {
  const kinds = new Map<string, YamlCommandFile>();
  const pending = paths
    .map((path) => ({ path, kind: namedKindOf(path) }))
    .filter(({ kind }) => kind.includes !== NO_INCLUDES);
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const strings = stringsOf(await textOf(next.path, dependencies), dependencies);
    const included = includedPaths(next.path, strings, next.kind.includes);
    for (const path of included.flatMap((pattern) => matchingPaths(pattern, paths))) {
      if (!kinds.has(path) && namedKindOf(path) === DEFAULT_YAML_FILE) {
        kinds.set(path, next.kind);
        pending.push({ path, kind: next.kind });
      }
    }
  }
  return kinds;
}

/** Whether the variables of a YAML file are read: it names an old package, and it is no API. */
const isVariableSource = (path: string, text: string): boolean =>
  namesOriginalPackage(text) && (isCiConfigFile(path) || !mayBeApiDescription(text));

/** What the YAML files of `paths` give the other files of the project. */
export async function planYamlReach(
  paths: readonly string[],
  dependencies: ReachDependencies,
): Promise<YamlReach> {
  const yamlPaths = paths.filter((path) => YAML_EXTENSIONS.has(extensionOf(path)));
  const kinds = await includedKinds(yamlPaths, dependencies);
  const names = new Set<string>();
  for (const path of yamlPaths) {
    const text = await textOf(path, dependencies);
    if (text !== undefined && isVariableSource(path, text)) {
      const kind = kinds.get(path) ?? namedKindOf(path);
      for (const name of generatorVariables(text, stringsOf(text, dependencies), kind)) {
        names.add(name);
      }
    }
  }
  return { kinds, generatorVariables: names };
}
