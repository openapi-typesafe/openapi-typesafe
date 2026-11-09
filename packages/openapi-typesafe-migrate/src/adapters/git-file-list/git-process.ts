import { spawn } from "node:child_process";

/** The environment variables git inherits, as `process.env` holds them. */
export type GitEnvironment = Readonly<Record<string, string | undefined>>;

/** One git command: the git program by its absolute path, where it runs, and with what. */
export interface GitInvocation {
  readonly executable: string;
  readonly directory: string;
  readonly gitArguments: readonly string[];
  readonly environment: GitEnvironment;
}

/** How a git command ended: its exit code and output, or why it did not start. */
export type GitRun =
  | {
      readonly kind: "exited";
      readonly exitCode: number | null;
      readonly output: string;
      readonly errors: string;
    }
  | { readonly kind: "failed"; readonly reason: string };

/** Runs one git command exactly as given; the hardening is part of the invocation. */
export type GitProcess = (invocation: GitInvocation) => Promise<GitRun>;

/** A git process in a child process, with the invocation's environment and nothing else. */
export const spawnGitProcess: GitProcess = ({ executable, directory, gitArguments, environment }) =>
  new Promise((resolve) => {
    // spawn, not execFile: the output of a large repository has no buffer limit this way.
    const child = spawn(executable, [...gitArguments], { cwd: directory, env: environment });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    // Git is gone since it was found, or the directory does not exist.
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

/**
 * Settings that win over every config file, because the tool runs git in folders it did not
 * create: a nested repository unpacked from an archive, or a bare repository committed inside a
 * cloned one. Their config is not trusted.
 *
 * - `core.fsmonitor=false`: the fsmonitor hook is a command from config that `ls-files` and
 *   `check-ignore` run on every call.
 * - `protocol.allow=never`: refuses every transport that no `protocol.<name>.allow` key allows.
 *   A repository's own config can still allow one by name, so the environment below refuses
 *   them all for real.
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
 * A partial clone fetches a missing object from its promisor remote while it reads the index (a
 * sparse directory entry, for example), and a fetch runs commands from config (`core.sshCommand`,
 * `remote.<name>.uploadpack`, `ext::` URLs, credential helpers).
 *
 * - `GIT_ALLOW_PROTOCOL` set to an empty list: git then allows only the transports in the list,
 *   whatever any `protocol.*` key says (git 2.12 and newer), so no fetch starts. It is the
 *   guarantee on every git the tool supports; git reports the missing object on stderr and
 *   lists the files it can read.
 * - `GIT_NO_LAZY_FETCH=1`: git 2.45 and newer do not even try a fetch. Older git ignores it.
 * - `GIT_TERMINAL_PROMPT=0`: git never waits on a password prompt.
 */
const HARDENED_ENVIRONMENT = {
  GIT_ALLOW_PROTOCOL: "",
  GIT_NO_LAZY_FETCH: "1",
  GIT_TERMINAL_PROMPT: "0",
} as const;

/**
 * Variables that name a repository or a part of it. A git hook sets `GIT_DIR` and
 * `GIT_INDEX_FILE` for the commands it runs, so a run from a hook would list that repository
 * for every folder. The tool lists each folder by the repository the folder is in.
 */
const REPOSITORY_VARIABLES: readonly string[] = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
];
/** Makes git use this folder as the work tree, whatever `core.worktree` says. */
const WORK_TREE_VARIABLE = "GIT_WORK_TREE";

/** The environment of a hardened git command, from the environment the process has. */
function hardenedEnvironment(
  environment: GitEnvironment,
  workTree: string | undefined,
): GitEnvironment {
  const kept = Object.entries(environment).filter(
    ([name]) => !REPOSITORY_VARIABLES.includes(name.toUpperCase()),
  );
  const forced = workTree === undefined ? {} : { [WORK_TREE_VARIABLE]: workTree };
  return { ...Object.fromEntries(kept), ...forced, ...HARDENED_ENVIRONMENT };
}

/** What a hardened git command needs besides its arguments. */
export interface HardenedGitCommand {
  readonly executable: string;
  readonly directory: string;
  readonly environment: GitEnvironment;
  /** The folder that holds the `.git` of the repository, or undefined when there is none. */
  readonly workTree: string | undefined;
}

/** The invocation of `gitArguments` with the hardening above. */
export function hardenedInvocation(
  command: HardenedGitCommand,
  gitArguments: readonly string[],
): GitInvocation {
  return {
    executable: command.executable,
    directory: command.directory,
    gitArguments: [...HARDENED_CONFIG, ...gitArguments],
    environment: hardenedEnvironment(command.environment, command.workTree),
  };
}
