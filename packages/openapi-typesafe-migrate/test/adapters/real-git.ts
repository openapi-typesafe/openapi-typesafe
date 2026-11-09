import {
  createGitFileList,
  type GitEnvironment,
  type GitFileList,
} from "../../src/adapters/git-file-list/git-file-list.js";
import { createNodeGitFileSystem } from "../../src/adapters/git-file-list/git-locations.js";
import type { GitProcess } from "../../src/adapters/git-file-list/git-process.js";

/** The git file list as the CLI wires it: the real git from PATH, on this platform. */
export function createRealGitFileList(
  environment: GitEnvironment = process.env,
  gitProcess?: GitProcess,
): GitFileList {
  return createGitFileList({
    environment,
    platform: process.platform,
    fileSystem: createNodeGitFileSystem(),
    ...(gitProcess === undefined ? {} : { process: gitProcess }),
  });
}
