import type { GitFileList, GitListing } from "../../src/adapters/git-file-list/git-file-list.js";

/** A git file list that gives the same listing for every directory, and records the calls. */
export class FixedGitFileList implements GitFileList {
  readonly directories: string[] = [];
  readonly #listing: GitListing;

  constructor(listing: GitListing) {
    this.#listing = listing;
  }

  list(directory: string): Promise<GitListing> {
    this.directories.push(directory);
    return Promise.resolve(this.#listing);
  }
}
