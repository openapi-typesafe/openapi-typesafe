import {
  isApiDescription,
  mayBeApiDescription,
  referencedFiles,
} from "../domain/api-descriptions.js";
import type { DocumentRead, TreeNode } from "../domain/config-documents.js";
import { namesOriginalPackage } from "../domain/package-names.js";
import type { DocumentReaders, ProjectFiles } from "./ports.js";
import { extensionOf, isCiConfigFile, YAML_EXTENSIONS } from "./project-file-names.js";

/**
 * The files of a split API description: the YAML and JSON files that an API description of the
 * project reaches by `$ref`, directly or through other such files. Their values are data, so the
 * YAML command migration leaves them as it leaves the description.
 */

/** The parts of the project's API descriptions; empty when none is listed. */
export type ApiDescriptionParts = ReadonlySet<string>;

export const NO_API_DESCRIPTION_PARTS: ApiDescriptionParts = new Set();

const JSON_EXTENSION = ".json";

interface PartsDependencies {
  readonly files: ProjectFiles;
  readonly readers: DocumentReaders;
}

const isYaml = (path: string): boolean => YAML_EXTENSIONS.has(extensionOf(path));

/** A YAML or JSON file that can be an API description or a part of one; a CI config is neither. */
const isDescriptionFormat = (path: string): boolean =>
  (isYaml(path) || extensionOf(path) === JSON_EXTENSION) && !isCiConfigFile(path);

/** The text of a listed file, or undefined when it cannot be read. */
async function textOf(path: string, files: ProjectFiles): Promise<string | undefined> {
  const read = await files.read(path);
  return read.kind === "read" ? read.text : undefined;
}

/** The parsed documents of a YAML or JSON text, or undefined when it does not parse. */
function documentsOf(path: string, text: string, readers: DocumentReaders): TreeNode[] | undefined {
  const parsed: DocumentRead = (isYaml(path) ? readers.yaml : readers.json).read(text);
  return parsed.kind === "read" ? [...parsed.documents] : undefined;
}

/**
 * Whether a YAML file names an old package, so the command migration reads it: only then can a
 * part be changed. The descriptions, which can be large, are parsed only when there is one.
 */
async function hasNamingYaml(paths: readonly string[], files: ProjectFiles): Promise<boolean> {
  for (const path of paths.filter(isYaml)) {
    const text = await textOf(path, files);
    if (text !== undefined && namesOriginalPackage(text)) {
      return true;
    }
  }
  return false;
}

/** The API descriptions of the listing, with their parsed documents. */
async function descriptionRoots(
  paths: readonly string[],
  { files, readers }: PartsDependencies,
): Promise<Map<string, TreeNode[]>> {
  const roots = new Map<string, TreeNode[]>();
  for (const path of paths.filter(isDescriptionFormat)) {
    const text = await textOf(path, files);
    const documents =
      text !== undefined && mayBeApiDescription(text)
        ? documentsOf(path, text, readers)
        : undefined;
    if (documents !== undefined && isApiDescription(documents)) {
      roots.set(path, documents);
    }
  }
  return roots;
}

/**
 * The listed files that the API descriptions of `paths` reach by `$ref`, the descriptions
 * themselves left out. A part that cannot be read or parsed is still a part; its own references
 * are not followed.
 */
export async function apiDescriptionParts(
  paths: readonly string[],
  dependencies: PartsDependencies,
): Promise<ApiDescriptionParts> {
  if (!(await hasNamingYaml(paths, dependencies.files))) {
    return NO_API_DESCRIPTION_PARTS;
  }
  const listed = new Set(paths.filter(isDescriptionFormat));
  const roots = await descriptionRoots(paths, dependencies);
  const parts = new Set<string>();
  const pending = [...roots].flatMap(([path, documents]) => referencedFiles(path, documents));
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (!listed.has(path) || roots.has(path) || parts.has(path)) {
      continue;
    }
    parts.add(path);
    const text = await textOf(path, dependencies.files);
    const documents =
      text === undefined ? undefined : documentsOf(path, text, dependencies.readers);
    pending.push(...(documents === undefined ? [] : referencedFiles(path, documents)));
  }
  return parts;
}
