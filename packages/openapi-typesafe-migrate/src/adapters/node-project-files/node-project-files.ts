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

/**
 * Git also lists links, submodules and tracked files deleted from the working tree; only regular
 * files that exist are the project's files.
 */
async function isRegularFile(root: string, path: string): Promise<boolean> {
  try {
    return (await lstat(join(root, path))).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function existingFiles(root: string, paths: readonly string[]): Promise<string[]> {
  const candidates = paths.filter((path) => !isInSkippedDirectory(path));
  const isFile = await Promise.all(candidates.map((path) => isRegularFile(root, path)));
  return candidates.filter((_path, index) => isFile[index]);
}

class NodeProjectFiles implements ProjectFiles {
  readonly #root: string;
  readonly #options: NodeProjectFilesOptions;

  constructor(root: string, options: NodeProjectFilesOptions) {
    this.#root = root;
    this.#options = options;
  }

  /** Git's view of the project when it is in a git repository, so ignored files stay out. */
  async listFiles(): Promise<string[]> {
    const { git, logger } = this.#options;
    const listing = await git.list(this.#root);
    if (listing.kind === "listed") {
      const files = await existingFiles(this.#root, listing.paths);
      logger.info("files_listed", { source: "git", fileCount: files.length });
      return files;
    }
    // Not a git repository, or no git: walk the tree; only the skipped folders stay out.
    const files = await listTree(this.#root, "");
    logger.info("files_listed", {
      source: "tree",
      fileCount: files.length,
      reason: listing.reason,
    });
    return files;
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
