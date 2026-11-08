import type { DirectoryLister, FileStore } from "../../src/application/ports.ts";
import { compareOrdinal } from "../../src/domain/ordering.ts";

/**
 * FileStore and DirectoryLister over a Map of file paths; a directory exists while it holds a
 * file. `resolve` prefixes a fake root so tests can map absolute paths back.
 */
export class InMemoryFileStore implements FileStore, DirectoryLister {
  static readonly ROOT = "/memory";
  readonly files = new Map<string, string>();

  constructor(initialFiles: Readonly<Record<string, string>> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, content);
    }
  }

  async readText(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async listDirectories(path: string): Promise<readonly string[]> {
    return this.#listChildren(path, (rest) => rest.includes("/"));
  }

  async listFiles(path: string): Promise<readonly string[]> {
    return this.#listChildren(path, (rest) => !rest.includes("/"));
  }

  /** First path segments below `path` of the files whose remaining path matches `isWanted`. */
  #listChildren(path: string, isWanted: (rest: string) => boolean): readonly string[] {
    const prefix = path === "" ? "" : `${path}/`;
    const names = [...this.files.keys()]
      .filter((file) => file.startsWith(prefix))
      .map((file) => file.slice(prefix.length))
      .filter(isWanted)
      .map((rest) => rest.split("/")[0] as string);
    return [...new Set(names)].sort(compareOrdinal);
  }

  resolve(path: string): string {
    return `${InMemoryFileStore.ROOT}/${path}`;
  }

  /** Inverse of `resolve`, for fakes that receive absolute paths. */
  static toRelative(absolutePath: string): string {
    return absolutePath.slice(InMemoryFileStore.ROOT.length + 1);
  }
}
