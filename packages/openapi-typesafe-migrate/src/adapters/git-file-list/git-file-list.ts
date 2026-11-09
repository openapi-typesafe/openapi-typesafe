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
/**
 * Settings that win over every config file, because the tool runs git in folders it did not
 * create: a nested repository unpacked from an archive, or a bare repository committed inside a
 * cloned one. Their config is not trusted.
 *
 * - `core.fsmonitor=false`: the fsmonitor hook is a command from config that `ls-files` and
 *   `check-ignore` run on every call.
 * - `protocol.allow=never`: a partial clone fetches a missing object from its promisor remote
 *   while it reads the index (a sparse directory entry, for example), and a fetch runs commands
 *   from config (`core.sshCommand`, `ext::` URLs, credential helpers). With every transport
 *   refused, no fetch starts on any git version.
 * - `safe.bareRepository=explicit`: a bare repository found by walking up from the folder is
 *   refused, so its config is not read at all; the folder is then walked as a tree.
 *
 * These two commands write no index, so no hook runs, and they start no filter or pager.
 */
const HARDENED_CONFIG = [
  "-c",
  "core.fsmonitor=false",
  "-c",
  "protocol.allow=never",
  "-c",
  "safe.bareRepository=explicit",
] as const;
/**
 * Git 2.45 and newer never fetch missing objects with this variable set: the listing then fails
 * on a missing object instead of trying a remote, and the folder is walked as a tree.
 * `GIT_TERMINAL_PROMPT=0` keeps git from waiting on a password prompt if anything still asks.
 */
const HARDENED_ENVIRONMENT = { GIT_NO_LAZY_FETCH: "1", GIT_TERMINAL_PROMPT: "0" } as const;
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

/** The environment variables git inherits, as `process.env` holds them. */
export type GitEnvironment = Readonly<Record<string, string | undefined>>;

/** Where git runs, with what, and the environment it inherits. */
interface GitInvocation {
  readonly directory: string;
  readonly gitArguments: readonly string[];
  readonly environment: GitEnvironment;
}

function runGit({ directory, gitArguments, environment }: GitInvocation): Promise<GitRun> {
  return new Promise((resolve) => {
    // spawn, not execFile: the output of a large repository has no buffer limit this way.
    const child = spawn(GIT_COMMAND, [...HARDENED_CONFIG, ...gitArguments], {
      cwd: directory,
      env: { ...environment, ...HARDENED_ENVIRONMENT },
    });
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

async function listDirectory(directory: string, environment: GitEnvironment): Promise<GitListing> {
  const ignored = await runGit({ directory, gitArguments: CHECK_IGNORE_ARGUMENTS, environment });
  if (ignored.kind === "exited" && ignored.exitCode === IGNORED_EXIT_CODE) {
    return { kind: "unavailable", reason: IGNORED_REASON };
  }
  if (ignored.kind === "failed" || ignored.exitCode !== NOT_IGNORED_EXIT_CODE) {
    return { kind: "unavailable", reason: failureReason(ignored) };
  }
  const listed = await runGit({ directory, gitArguments: LS_FILES_ARGUMENTS, environment });
  if (listed.kind === "failed" || listed.exitCode !== 0) {
    return { kind: "unavailable", reason: failureReason(listed) };
  }
  return { kind: "listed", paths: listedPaths(listed.output) };
}

class SpawnedGitFileList implements GitFileList {
  readonly #environment: GitEnvironment;

  constructor(environment: GitEnvironment) {
    this.#environment = environment;
  }

  list(directory: string): Promise<GitListing> {
    return listDirectory(directory, this.#environment);
  }
}

/**
 * A git file list that runs `git check-ignore` and `git ls-files` in a child process, with
 * `environment` (the process environment: `PATH`, `HOME` and git's own variables) and the
 * hardening above on top of it.
 */
export function createGitFileList(environment: GitEnvironment): GitFileList {
  return new SpawnedGitFileList(environment);
}
