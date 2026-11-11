/**
 * A file of the project that names another one by a relative reference (`./deps.json`,
 * `../schemas/Job.yaml`), which its tool resolves against the folder of the file.
 */

const SEPARATOR = "/";
const CURRENT_FOLDER = ".";
const PARENT_FOLDER = "..";
// A URL scheme (`https:`, `file:`): the tool fetches or reads such a file from where it says.
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/** The project-relative path of `reference` from the folder of `fromPath`, or undefined. */
function resolvedPath(fromPath: string, reference: string): string | undefined {
  const parts = fromPath.split(SEPARATOR).slice(0, -1);
  for (const part of reference.split(SEPARATOR)) {
    if (part === PARENT_FOLDER) {
      if (parts.pop() === undefined) {
        return undefined;
      }
    } else if (part !== CURRENT_FOLDER && part !== "") {
      parts.push(part);
    }
  }
  return parts.join(SEPARATOR);
}

/**
 * The project-relative path that `reference` in the file at `fromPath` names, or undefined for a
 * URL, an absolute path, a path outside the project, or the project folder itself.
 */
export function referencedProjectPath(fromPath: string, reference: string): string | undefined {
  const isOutside = URL_SCHEME.test(reference) || reference.startsWith(SEPARATOR);
  const path = isOutside ? undefined : resolvedPath(fromPath, reference);
  return path === "" ? undefined : path;
}
