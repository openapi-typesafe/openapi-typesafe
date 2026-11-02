import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FileStore } from "../application/ports.ts";

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * FileStore over the local file system, rooted at one directory. Parent directories are created on
 * write.
 */
export class NodeFileStore implements FileStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  resolve(path: string): string {
    return resolve(this.#root, path);
  }

  async readText(path: string): Promise<string | undefined> {
    try {
      return await readFile(this.resolve(path), "utf8");
    } catch (error) {
      if (isMissingFileError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  async writeText(path: string, content: string): Promise<void> {
    const absolutePath = this.resolve(path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, "utf8");
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(this.resolve(path));
      return true;
    } catch (error) {
      if (isMissingFileError(error)) {
        return false;
      }
      throw error;
    }
  }

  async remove(path: string): Promise<void> {
    await rm(this.resolve(path), { force: true });
  }
}
