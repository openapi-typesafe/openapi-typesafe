import { spawn } from "node:child_process";

/** The files git lists for a directory, or why it could not list them. */
export type GitListing =
  | { readonly kind: "listed"; readonly paths: readonly string[] }
  | { readonly kind: "unavailable"; readonly reason: string };

/** Lists the files of a directory the way git sees them: tracked, or untracked and not ignored. */
export interface GitFileList {
  list(directory: string): Promise<GitListing>;
}

/**
 * Tracked files, and untracked files that `.gitignore`, `.git/info/exclude` and the global
 * excludes file do not ignore, under the working directory, relative to it, NUL-separated.
 */
const LS_FILES_ARGUMENTS = [
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
] as const;
const GIT_COMMAND = "git";

function runGit(directory: string): Promise<GitListing> {
  return new Promise((resolve) => {
    // spawn, not execFile: the output of a large repository has no buffer limit this way.
    const child = spawn(GIT_COMMAND, LS_FILES_ARGUMENTS, { cwd: directory });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    // Git is not installed, or the directory does not exist.
    child.on("error", (error) => resolve({ kind: "unavailable", reason: error.message }));
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        const reason = Buffer.concat(errors).toString("utf8").trim() || `exit code ${exitCode}`;
        resolve({ kind: "unavailable", reason });
        return;
      }
      const paths = Buffer.concat(output).toString("utf8").split("\0");
      resolve({ kind: "listed", paths: paths.filter((path) => path !== "") });
    });
  });
}

class SpawnedGitFileList implements GitFileList {
  list(directory: string): Promise<GitListing> {
    return runGit(directory);
  }
}

/** A git file list that runs `git ls-files` in a child process. */
export function createGitFileList(): GitFileList {
  return new SpawnedGitFileList();
}
