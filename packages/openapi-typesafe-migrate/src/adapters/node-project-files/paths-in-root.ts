import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

const PARENT_DIRECTORY = "..";

/** What a path that git lists is on disk. */
export type ListedEntry = "file" | "directory" | "other" | "outside";

/**
 * Whether `path` stays under the folder it is relative to, by its text. Git checks a path when it
 * adds it to the index, but it prints an index that it did not write (one in a planted `.git`) as
 * it is, with `../` or a leading `/`. Links are checked by the real path.
 */
export function isRelativeDownward(path: string): boolean {
  return !isAbsolute(path) && !path.split("/").includes(PARENT_DIRECTORY);
}

/** Whether the real path `target` is in the real folder `folder`, not the folder itself. */
export function isInFolder(folder: string, target: string): boolean {
  const path = relative(folder, target);
  return (
    path !== "" &&
    path !== PARENT_DIRECTORY &&
    !path.startsWith(`${PARENT_DIRECTORY}${sep}`) &&
    !isAbsolute(path)
  );
}

/**
 * Git also lists links and tracked files deleted from the working tree; only regular files that
 * exist are the project's files. A directory is a submodule or a nested repository. A path whose
 * real path is outside the root (by `..`, a linked parent folder, or a link itself) is "outside",
 * so the report names it. A link inside the root is "other": links are not followed, and what it
 * points at is listed on its own.
 */
export async function entryAt(root: string, realRoot: string, path: string): Promise<ListedEntry> {
  if (!isRelativeDownward(path)) {
    return "outside";
  }
  try {
    const stats = await lstat(join(root, path));
    const isListable = stats.isFile() || stats.isDirectory();
    if (!isListable && !stats.isSymbolicLink()) {
      return "other";
    }
    if (!isInFolder(realRoot, await realpath(join(root, path)))) {
      return "outside";
    }
    if (!isListable) {
      return "other";
    }
    return stats.isFile() ? "file" : "directory";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "other";
    }
    throw error;
  }
}
