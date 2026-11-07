import { spawn } from "node:child_process";

/** The paths git lists for a directory, or why it could not list them. */
export type GitListing =
  | { readonly kind: "listed"; readonly paths: readonly string[] }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * Lists a directory the way git sees it: tracked files, and untracked files that are not ignored.
 * A submodule or a nested repository is one path: the directory, without a trailing slash.
 */
export interface GitFileList {
  list(directory: string): Promise<GitListing>;
}

/**
 * Tracked files, and untracked files that `.gitignore`, `.git/info/exclude` and the global
 * excludes file do not ignore, under the working directory, relative to it, NUL-separated. A file
 * in a merge conflict is in the index once per side; `--deduplicate` (git 2.31) lists it once.
 */
const LS_FILES_ARGUMENTS = [
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "--deduplicate",
  "-z",
] as const;
/**
 * Exit code 0 when the working directory is ignored by the repository it is in, 1 when not. Git
 * lists nothing in an ignored directory, so its listing would look like an empty project.
 */
const CHECK_IGNORE_ARGUMENTS = ["check-ignore", "--quiet", "."] as const;
const IGNORED_EXIT_CODE = 0;
const NOT_IGNORED_EXIT_CODE = 1;
const IGNORED_REASON = "the git repository around the folder ignores it";
const GIT_COMMAND = "git";
/** An untracked nested repository is listed with a slash, and the directory itself as `./`. */
const TRAILING_SLASH_RE = /\/$/;
const SELF_PATHS: ReadonlySet<string> = new Set(["", "."]);

type GitRun =
  | {
      readonly kind: "exited";
      readonly exitCode: number | null;
      readonly output: string;
      readonly errors: string;
    }
  | { readonly kind: "failed"; readonly reason: string };

function runGit(directory: string, gitArguments: readonly string[]): Promise<GitRun> {
  return new Promise((resolve) => {
    // spawn, not execFile: the output of a large repository has no buffer limit this way.
    const child = spawn(GIT_COMMAND, gitArguments, { cwd: directory });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    // Git is not installed, or the directory does not exist.
    child.on("error", (error) => resolve({ kind: "failed", reason: error.message }));
    child.on("close", (exitCode) => {
      resolve({
        kind: "exited",
        exitCode,
        output: Buffer.concat(output).toString("utf8"),
        errors: Buffer.concat(errors).toString("utf8").trim(),
      });
    });
  });
}

function failureReason(run: GitRun): string {
  if (run.kind === "failed") {
    return run.reason;
  }
  return run.errors || `exit code ${run.exitCode}`;
}

function listedPaths(output: string): string[] {
  return output
    .split("\0")
    .map((path) => path.replace(TRAILING_SLASH_RE, ""))
    .filter((path) => !SELF_PATHS.has(path));
}

async function listDirectory(directory: string): Promise<GitListing> {
  const ignored = await runGit(directory, CHECK_IGNORE_ARGUMENTS);
  if (ignored.kind === "exited" && ignored.exitCode === IGNORED_EXIT_CODE) {
    return { kind: "unavailable", reason: IGNORED_REASON };
  }
  if (ignored.kind === "failed" || ignored.exitCode !== NOT_IGNORED_EXIT_CODE) {
    return { kind: "unavailable", reason: failureReason(ignored) };
  }
  const listed = await runGit(directory, LS_FILES_ARGUMENTS);
  if (listed.kind === "failed" || listed.exitCode !== 0) {
    return { kind: "unavailable", reason: failureReason(listed) };
  }
  return { kind: "listed", paths: listedPaths(listed.output) };
}

class SpawnedGitFileList implements GitFileList {
  list(directory: string): Promise<GitListing> {
    return listDirectory(directory);
  }
}

/** A git file list that runs `git check-ignore` and `git ls-files` in a child process. */
export function createGitFileList(): GitFileList {
  return new SpawnedGitFileList();
}
