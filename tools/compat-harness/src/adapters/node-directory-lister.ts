import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { DirectoryLister } from "../application/ports.ts";
import { compareOrdinal } from "../domain/ordering.ts";

function isMissingDirectoryError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** DirectoryLister over the local file system, rooted at one directory. */
export class NodeDirectoryLister implements DirectoryLister {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  async listDirectories(path: string): Promise<readonly string[]> {
    return this.#list(path, (entry) => entry.isDirectory());
  }

  async listFiles(path: string): Promise<readonly string[]> {
    return this.#list(path, (entry) => entry.isFile());
  }

  async #list(path: string, isWanted: (entry: Dirent) => boolean): Promise<readonly string[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(resolve(this.#root, path), { withFileTypes: true });
    } catch (error) {
      if (isMissingDirectoryError(error)) {
        return [];
      }
      throw error;
    }
    return entries
      .filter(isWanted)
      .map((entry) => entry.name)
      .sort(compareOrdinal);
  }
}
