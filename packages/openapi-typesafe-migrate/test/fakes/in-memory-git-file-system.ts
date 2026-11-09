import type { GitFileSystem } from "../../src/adapters/git-file-list/git-locations.js";

/** A git file system with fixed executable files and other entries, by their full paths. */
export class InMemoryGitFileSystem implements GitFileSystem {
  readonly #executables: ReadonlySet<string>;
  readonly #entries: ReadonlySet<string>;

  constructor(executables: readonly string[], entries: readonly string[] = []) {
    this.#executables = new Set(executables);
    this.#entries = new Set([...executables, ...entries]);
  }

  isExecutableFile(path: string): Promise<boolean> {
    return Promise.resolve(this.#executables.has(path));
  }

  hasEntry(path: string): Promise<boolean> {
    return Promise.resolve(this.#entries.has(path));
  }

  /** The fixed paths hold no links, so a path is its own real path. */
  realPath(path: string): Promise<string | undefined> {
    return Promise.resolve(path);
  }
}
