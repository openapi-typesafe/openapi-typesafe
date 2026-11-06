import type { Dirent } from "node:fs";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Logger, ProjectFiles } from "../../application/ports.js";
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
type ListedEntry = "file" | "directory" | "other";

/**
 * Git also lists links and tracked files deleted from the working tree; only regular files that
 * exist are the project's files. A directory is a submodule or a nested repository.
 */
async function entryAt(root: string, path: string): Promise<ListedEntry> {
  try {
    const stats = await lstat(join(root, path));
    if (stats.isFile()) {
      return "file";
    }
    return stats.isDirectory() ? "directory" : "other";
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
}

/** The files and the nested repositories of a git listing, by paths relative to the root. */
async function listedPaths(root: string, paths: readonly string[]): Promise<ListedPaths> {
  const candidates = paths.filter((path) => !isInSkippedDirectory(path));
  const entries = await Promise.all(candidates.map((path) => entryAt(root, path)));
  const directories = candidates.filter(
    (path, index) => entries[index] === "directory" && !SKIPPED_DIRECTORIES.has(baseName(path)),
  );
  return { files: candidates.filter((_path, index) => entries[index] === "file"), directories };
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function joinRelative(directory: string, path: string): string {
  return directory === "" ? path : `${directory}/${path}`;
}

class NodeProjectFiles implements ProjectFiles {
  readonly #root: string;
  readonly #options: NodeProjectFilesOptions;

  constructor(root: string, options: NodeProjectFilesOptions) {
    this.#root = root;
    this.#options = options;
  }

  /** Git's view of the project when it is in a git repository, so ignored files stay out. */
  listFiles(): Promise<string[]> {
    return this.#listDirectory("");
  }

  /**
   * One directory, by the git repository it is in. Git lists a submodule or a nested repository
   * as one entry, so each of those is listed the same way, by its own repository and ignore rules.
   */
  async #listDirectory(directory: string): Promise<string[]> {
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
      return files;
    }
    const paths = listing.paths.map((path) => joinRelative(directory, path));
    const { files, directories } = await listedPaths(this.#root, paths);
    logger.info("files_listed", { ...logged, source: "git", fileCount: files.length });
    const nested = await Promise.all(directories.map((path) => this.#listDirectory(path)));
    return [...files, ...nested.flat()];
  }

  read(path: string): Promise<string> {
    return readFile(join(this.#root, path), "utf8");
  }

  write(path: string, text: string): Promise<void> {
    return writeFile(join(this.#root, path), text, "utf8");
  }
}

/** The files of the project in the directory `root`, by `/`-separated relative paths. */
export function createNodeProjectFiles(
  root: string,
  options: NodeProjectFilesOptions,
): ProjectFiles {
  return new NodeProjectFiles(root, options);
}
