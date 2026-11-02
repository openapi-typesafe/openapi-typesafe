import type { Dirent } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectFiles } from "../../application/ports.js";

/**
 * Installed packages, git metadata and build output are not the project's own files. Links are
 * not followed, so a linked workspace package is migrated in its own project, not twice.
 */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(["node_modules", ".git", "dist"]);

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

class NodeProjectFiles implements ProjectFiles {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  listFiles(): Promise<string[]> {
    return listTree(this.#root, "");
  }

  read(path: string): Promise<string> {
    return readFile(join(this.#root, path), "utf8");
  }

  write(path: string, text: string): Promise<void> {
    return writeFile(join(this.#root, path), text, "utf8");
  }
}

/** The files of the project in the directory `root`, by `/`-separated relative paths. */
export function createNodeProjectFiles(root: string): ProjectFiles {
  return new NodeProjectFiles(root);
}
