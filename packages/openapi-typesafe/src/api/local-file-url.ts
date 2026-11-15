import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { FileCheck } from "../application/ports/file-system.js";

/** Whether a URL names a file or directory on this computer; shared by the options and the CLI. */

/** What a `file:` URL that names no local path is, for an `OPTION_INVALID` or a CLI error. */
export const NO_LOCAL_PATH_KIND = "a file: URL that names no local path";

/**
 * Whether the URL is a `file:` URL that names a local path. One with a host (`file://specs/a.yaml`,
 * which looks like the relative `file:specs/a.yaml`) or with an encoded slash (`file:///a%2Fb`)
 * names none on this platform: Node.js refuses to turn it into a path, so every later file
 * operation on it would throw. Node.js refuses a URL of another scheme the same way.
 */
export function isLocalFileUrl(url: URL): boolean {
  try {
    fileURLToPath(url);
    return true;
  } catch {
    // The error says only which rule the URL breaks; the callers name the value instead.
    return false;
  }
}

/** What a local root is when a file stands where its directory would be, for the errors. */
export const FILE_ROOT_KINDS = {
  file: "a file",
  belowFile: "a path below a file",
} as const;

export type FileRootKind = (typeof FILE_ROOT_KINDS)[keyof typeof FILE_ROOT_KINDS];

/** Whether an existing file is at the absolute path or at one of its parent folders. */
function isFileAtOrAbove(target: string, files: FileCheck): boolean {
  if (files.isFile(pathToFileURL(target))) {
    return true;
  }
  const parent = path.dirname(target);
  return parent !== target && isFileAtOrAbove(parent, files);
}

/**
 * Why no directory can be at a local `file:` URL: a file is there, or at one of its parent
 * folders; undefined when a directory is there or may be created there. The path is resolved
 * first, so a trailing slash cannot hide the file (`api.yaml/` is the file `api.yaml`): asked
 * as it is, the file system answers "not a directory", which read as "no file". A local `$ref`
 * root there would refuse every `$ref` as outside it, so the CLI flag, `redocly.yaml` and the
 * Node API all ask this one check before anything loads.
 */
export function fileRootKindOf(root: URL, files: FileCheck): FileRootKind | undefined {
  const target = path.resolve(fileURLToPath(root));
  if (files.isFile(pathToFileURL(target))) {
    return FILE_ROOT_KINDS.file;
  }
  const parent = path.dirname(target);
  return parent !== target && isFileAtOrAbove(parent, files) ? FILE_ROOT_KINDS.belowFile : undefined;
}
