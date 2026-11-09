import type { GitFileSystem } from "../../src/adapters/git-file-list/git-locations.js";

/**
 * A git file system with fixed executable files and other entries, by their full paths, and
 * folder links (`link → target`) that `realPath` resolves.
 */
export class InMemoryGitFileSystem implements GitFileSystem {
  readonly #executables: ReadonlySet<string>;
  readonly #entries: ReadonlySet<string>;
  readonly #links: Readonly<Record<string, string>>;

  constructor(
    executables: readonly string[],
    entries: readonly string[] = [],
    links: Readonly<Record<string, string>> = {},
  ) {
    this.#executables = new Set(executables);
    this.#entries = new Set([...executables, ...entries]);
    this.#links = links;
  }

  isExecutableFile(path: string): Promise<boolean> {
    return Promise.resolve(this.#executables.has(path));
  }

  hasEntry(path: string): Promise<boolean> {
    return Promise.resolve(this.#entries.has(path));
  }

  /** A linked folder gives its target; any other path is its own real path. */
  realPath(path: string): Promise<string | undefined> {
    return Promise.resolve(this.#links[path] ?? path);
  }
}
