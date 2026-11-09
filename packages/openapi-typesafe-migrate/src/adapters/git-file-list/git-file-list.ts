import {
  findGitExecutable,
  findWorkTree,
  type GitFileSystem,
  type GitHost,
} from "./git-locations.js";
import {
  type GitEnvironment,
  type GitProcess,
  type GitRun,
  type HardenedGitCommand,
  hardenedInvocation,
  spawnGitProcess,
} from "./git-process.js";

export type { GitEnvironment } from "./git-process.js";

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
const NO_GIT_REASON = "no git executable in an absolute folder of PATH";
/** An untracked nested repository is listed with a slash, and the directory itself as `./`. */
const TRAILING_SLASH_RE = /\/$/;
const SELF_PATHS: ReadonlySet<string> = new Set(["", "."]);

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

async function listWith(command: HardenedGitCommand, run: GitProcess): Promise<GitListing> {
  const ignored = await run(hardenedInvocation(command, CHECK_IGNORE_ARGUMENTS));
  if (ignored.kind === "exited" && ignored.exitCode === IGNORED_EXIT_CODE) {
    return { kind: "unavailable", reason: IGNORED_REASON };
  }
  if (ignored.kind === "failed" || ignored.exitCode !== NOT_IGNORED_EXIT_CODE) {
    return { kind: "unavailable", reason: failureReason(ignored) };
  }
  const listed = await run(hardenedInvocation(command, LS_FILES_ARGUMENTS));
  if (listed.kind === "failed" || listed.exitCode !== 0) {
    return { kind: "unavailable", reason: failureReason(listed) };
  }
  return { kind: "listed", paths: listedPaths(listed.output) };
}

/** What the git file list runs git with. */
export interface GitFileListOptions {
  /** The process environment: `PATH`, `HOME` and git's own variables. */
  readonly environment: GitEnvironment;
  readonly platform: NodeJS.Platform;
  readonly fileSystem: GitFileSystem;
  /** Runs one git command; a child process unless a test wraps it. */
  readonly process?: GitProcess;
}

class HardenedGitFileList implements GitFileList {
  readonly #host: GitHost;
  readonly #process: GitProcess;
  /** PATH is searched once, on the first listing. */
  #executable: Promise<string | undefined> | undefined;

  constructor(options: GitFileListOptions) {
    this.#host = options;
    this.#process = options.process ?? spawnGitProcess;
  }

  async list(directory: string): Promise<GitListing> {
    this.#executable ??= findGitExecutable(this.#host);
    const executable = await this.#executable;
    if (executable === undefined) {
      return { kind: "unavailable", reason: NO_GIT_REASON };
    }
    const workTree = await findWorkTree(directory, this.#host);
    const { environment } = this.#host;
    return listWith({ executable, directory, environment, workTree }, this.#process);
  }
}

/**
 * A git file list that runs `git check-ignore` and `git ls-files` (git-process.ts has the
 * hardening): git by its absolute path from PATH, with the folder that holds the `.git` of the
 * listed directory as the work tree.
 */
export function createGitFileList(options: GitFileListOptions): GitFileList {
  return new HardenedGitFileList(options);
}
