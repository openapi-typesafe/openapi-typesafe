import {
  createGitFileList,
  type GitEnvironment,
  type GitFileList,
} from "../../src/adapters/git-file-list/git-file-list.js";
import { createNodeGitFileSystem } from "../../src/adapters/git-file-list/git-locations.js";
import type { GitProcess } from "../../src/adapters/git-file-list/git-process.js";

/** The git file list as the CLI wires it for `projectRoot`: the real git from PATH. */
export function createRealGitFileList(
  projectRoot: string,
  environment: GitEnvironment = process.env,
  gitProcess?: GitProcess,
): GitFileList {
  return createGitFileList({
    environment,
    platform: process.platform,
    fileSystem: createNodeGitFileSystem(),
    projectRoot,
    ...(gitProcess === undefined ? {} : { process: gitProcess }),
  });
}
