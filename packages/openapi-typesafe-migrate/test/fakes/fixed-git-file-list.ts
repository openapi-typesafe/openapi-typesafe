import type { GitFileList, GitListing } from "../../src/adapters/git-file-list/git-file-list.js";

/**
 * A git file list with a fixed listing per directory, and one listing for every other directory.
 * It records the directories it was asked for.
 */
export class FixedGitFileList implements GitFileList {
  readonly directories: string[] = [];
  readonly #listing: GitListing;
  readonly #listingsByDirectory: ReadonlyMap<string, GitListing>;

  constructor(
    listing: GitListing,
    listingsByDirectory: ReadonlyMap<string, GitListing> = new Map(),
  ) {
    this.#listing = listing;
    this.#listingsByDirectory = listingsByDirectory;
  }

  list(directory: string): Promise<GitListing> {
    this.directories.push(directory);
    return Promise.resolve(this.#listingsByDirectory.get(directory) ?? this.#listing);
  }
}
