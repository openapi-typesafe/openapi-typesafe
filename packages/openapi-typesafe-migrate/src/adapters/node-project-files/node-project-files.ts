import type { Dirent } from "node:fs";
import {
  chmod,
  lstat,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import type {
  Logger,
  ProjectFileList,
  ProjectFiles,
  ProjectRootState,
  SkippedFile,
} from "../../application/ports.js";
import type { GitFileList } from "../git-file-list/git-file-list.js";

/**
 * Installed packages, git metadata, build output and the output folders of frameworks and test
 * tools are not the project's own files: rewriting them only adds noise to the dry run and the
 * diff. They are skipped even when git tracks them.
 * `build` and `out` stay in, because some projects keep sources there. Links are not followed, so a
 * linked workspace package is migrated in its own project, not twice.
 */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  "coverage",
]);

const CURRENT_DIRECTORY = ".";
/** The new text is written next to the file under this suffix, then renamed over it. */
const TEMPORARY_SUFFIX = ".openapi-typesafe-migrate.tmp";
const PERMISSION_BITS = 0o7777;
/** Only the owner can read the new text until it has the mode of the file it replaces. */
const TEMPORARY_MODE = 0o600;
const PARENT_DIRECTORY = "..";

/** What the project files read besides the file system. */
export interface NodeProjectFilesOptions {
  readonly git: GitFileList;
  readonly logger: Logger;
}

function isInSkippedDirectory(path: string): boolean {
  return path
    .split("/")
    .slice(0, -1)
    .some((directory) => SKIPPED_DIRECTORIES.has(directory));
}

async function listTree(root: string, relative: string): Promise<string[]> {
  const entries: Dirent[] = await readdir(join(root, relative), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        return SKIPPED_DIRECTORIES.has(entry.name) ? [] : listTree(root, path);
      }
      return entry.isFile() ? [path] : [];
    }),
  );
  return nested.flat();
}

/** What a path that git lists is on disk. */
type ListedEntry = "file" | "directory" | "other" | "outside";

/**
 * Whether `path` stays under the folder it is relative to, by its text. Git checks a path when it
 * adds it to the index, but it prints an index that it did not write (one in a planted `.git`) as
 * it is, with `../` or a leading `/`. Links are checked by the real path.
 */
function isRelativeDownward(path: string): boolean {
  return !isAbsolute(path) && !path.split("/").includes(PARENT_DIRECTORY);
}

/** Whether the real path `target` is in the real folder `folder`, not the folder itself. */
function isInFolder(folder: string, target: string): boolean {
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
 * exist are the project's files. A directory is a submodule or a nested repository. A file or
 * directory whose real path is outside the root (by `..`, or by a linked parent folder) is
 * "outside".
 */
async function entryAt(root: string, realRoot: string, path: string): Promise<ListedEntry> {
  if (!isRelativeDownward(path)) {
    return "outside";
  }
  try {
    const stats = await lstat(join(root, path));
    if (!stats.isFile() && !stats.isDirectory()) {
      return "other";
    }
    if (!isInFolder(realRoot, await realpath(join(root, path)))) {
      return "outside";
    }
    return stats.isFile() ? "file" : "directory";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "other";
    }
    throw error;
  }
}

interface ListedPaths {
  readonly files: readonly string[];
  readonly directories: readonly string[];
  readonly skipped: readonly SkippedFile[];
}

/** The files, the nested repositories and the paths outside the root of a git listing. */
async function listedPaths(
  root: string,
  realRoot: string,
  paths: readonly string[],
): Promise<ListedPaths> {
  const candidates = paths.filter((path) => !isInSkippedDirectory(path));
  const entries = await Promise.all(candidates.map((path) => entryAt(root, realRoot, path)));
  const withEntry = (entry: ListedEntry) =>
    candidates.filter((_path, index) => entries[index] === entry);
  return {
    files: withEntry("file"),
    directories: withEntry("directory").filter((path) => !SKIPPED_DIRECTORIES.has(baseName(path))),
    skipped: withEntry("outside").map((path): SkippedFile => ({ path, reason: "outside-root" })),
  };
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function joinRelative(directory: string, path: string): string {
  return directory === "" ? path : `${directory}/${path}`;
}

const NO_FILES: ProjectFileList = { files: [], skipped: [] };

function joinLists(lists: readonly ProjectFileList[]): ProjectFileList {
  return lists.reduce(
    (joined, list) => ({
      files: [...joined.files, ...list.files],
      skipped: [...joined.skipped, ...list.skipped],
    }),
    NO_FILES,
  );
}

class NodeProjectFiles implements ProjectFiles {
  readonly #root: string;
  readonly #options: NodeProjectFilesOptions;

  constructor(root: string, options: NodeProjectFilesOptions) {
    this.#root = root;
    this.#options = options;
  }

  /** Git's view of the project when it is in a git repository, so ignored files stay out. */
  async listFiles(): Promise<ProjectFileList> {
    return this.#listDirectory(await realpath(this.#root), "");
  }

  /**
   * One directory, by the git repository it is in. Git lists a submodule or a nested repository
   * as one entry, so each of those is listed the same way, by its own repository and ignore rules.
   */
  async #listDirectory(realRoot: string, directory: string): Promise<ProjectFileList> {
    const { git, logger } = this.#options;
    const listing = await git.list(join(this.#root, directory));
    const logged = { directory: directory === "" ? CURRENT_DIRECTORY : directory };
    if (listing.kind === "unavailable") {
      // Not a git repository, no git, or ignored by the repository around it: walk the tree; only
      // the skipped folders stay out.
      const files = await listTree(this.#root, directory);
      logger.info("files_listed", {
        ...logged,
        source: "tree",
        fileCount: files.length,
        reason: listing.reason,
      });
      return { files, skipped: [] };
    }
    const paths = listing.paths.map((path) => joinRelative(directory, path));
    const { files, directories, skipped } = await listedPaths(this.#root, realRoot, paths);
    logger.info("files_listed", { ...logged, source: "git", fileCount: files.length });
    for (const file of skipped) {
      logger.warn("file_skipped", { ...file });
    }
    const nested = await Promise.all(
      directories.map((path) => this.#listDirectory(realRoot, path)),
    );
    return joinLists([{ files, skipped }, ...nested]);
  }

  async read(path: string): Promise<string> {
    return readFile(await this.#pathInRoot(path), "utf8");
  }

  /**
   * Writes a new file and renames it over the old one, so the write never goes through a link: a
   * hard link to a file outside the root keeps its old text, and is reported in the log. The new
   * file keeps the mode of the old one.
   */
  async write(path: string, text: string): Promise<void> {
    const target = await this.#pathInRoot(path);
    const { mode, nlink } = await lstat(target);
    // `wx`: a leftover of a failed run is not overwritten; the error names it.
    const temporary = join(dirname(target), `.${basename(target)}${TEMPORARY_SUFFIX}`);
    await writeFile(temporary, text, { encoding: "utf8", flag: "wx", mode: TEMPORARY_MODE });
    try {
      // The mode is set after the write, because `writeFile`'s mode is reduced by the umask.
      await chmod(temporary, mode & PERMISSION_BITS);
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    if (nlink > 1) {
      this.#options.logger.warn("hard_link_separated", { path, linkCount: nlink });
    }
  }

  /** The real path of a project file; refuses one that resolves outside the root. */
  async #pathInRoot(path: string): Promise<string> {
    const realPath = isRelativeDownward(path) ? await realpath(join(this.#root, path)) : undefined;
    if (realPath === undefined || !isInFolder(await realpath(this.#root), realPath)) {
      throw new Error(`${path} is outside the project folder ${this.#root}`);
    }
    return realPath;
  }
}

/** The files of the project in the directory `root`, by `/`-separated relative paths. */
export function createNodeProjectFiles(
  root: string,
  options: NodeProjectFilesOptions,
): ProjectFiles {
  return new NodeProjectFiles(root, options);
}

const MISSING_PATH_CODES: ReadonlySet<string> = new Set(["ENOENT", "ENOTDIR"]);

/**
 * Whether `root` is a folder the migration can list, by its real path (a link to a folder is
 * one). Asked before anything is listed, so `--root` naming a file or nothing fails with a clear
 * message instead of git's or the file system's.
 */
export async function inspectProjectRoot(root: string): Promise<ProjectRootState> {
  try {
    return (await stat(root)).isDirectory() ? "directory" : "not-a-directory";
  } catch (error) {
    if (MISSING_PATH_CODES.has((error as NodeJS.ErrnoException).code ?? "")) {
      return "missing";
    }
    throw error;
  }
}
