import { constants } from "node:fs";
import { access, lstat, stat } from "node:fs/promises";
import { posix, win32 } from "node:path";
import type { GitEnvironment } from "./git-process.js";

/** What the git adapter reads from the file system to find git and the repository of a folder. */
export interface GitFileSystem {
  /** Whether `path` is a file that this process may execute. */
  isExecutableFile(path: string): Promise<boolean>;
  /** Whether anything (a file, a folder, a link) is at `path`. */
  hasEntry(path: string): Promise<boolean>;
}

/** Where git is looked for: the process environment, its platform and its file system. */
export interface GitHost {
  readonly environment: GitEnvironment;
  readonly platform: NodeJS.Platform;
  readonly fileSystem: GitFileSystem;
}

const WINDOWS = "win32";
const PATH_VARIABLE = "PATH";
const GIT_NAME = "git";
/**
 * Git for Windows puts `git.exe` on PATH. A `.cmd` or `.bat` file runs only through a shell, and
 * the tool never starts one, so executables are the only candidates.
 */
const WINDOWS_EXECUTABLE_EXTENSION = ".exe";
const GIT_FOLDER = ".git";
/**
 * Errors that mean "nothing usable is there": a missing path, a parent that is not a folder, or
 * no permission. Any other error is a fault of the file system and is passed on.
 */
const ABSENT_CODES: ReadonlySet<string> = new Set(["ENOENT", "ENOTDIR", "EACCES", "EPERM"]);

function isAbsent(error: unknown): boolean {
  return ABSENT_CODES.has((error as NodeJS.ErrnoException | undefined)?.code ?? "");
}

/** Whether `check` succeeds, false when it fails because nothing usable is at the path. */
async function succeeds(check: () => Promise<boolean>): Promise<boolean> {
  try {
    return await check();
  } catch (error) {
    if (isAbsent(error)) {
      return false;
    }
    throw error;
  }
}

const pathsOf = (platform: NodeJS.Platform) => (platform === WINDOWS ? win32 : posix);

/** The PATH variable; Windows spells its name in any case (`Path`). */
function pathVariable({ environment, platform }: GitHost): string {
  const name =
    platform === WINDOWS
      ? Object.keys(environment).find((key) => key.toUpperCase() === PATH_VARIABLE)
      : PATH_VARIABLE;
  return name === undefined ? "" : (environment[name] ?? "");
}

/**
 * The absolute path of the first git on PATH, or undefined when there is none. An empty or
 * relative PATH entry names a folder relative to the working directory, which is the project the
 * tool does not trust, so it is passed over. The absolute path also keeps Windows from looking in
 * the working directory first, as it does for a bare program name: a `git.exe` planted at the
 * project root never runs.
 */
export async function findGitExecutable(host: GitHost): Promise<string | undefined> {
  const paths = pathsOf(host.platform);
  const name = host.platform === WINDOWS ? `${GIT_NAME}${WINDOWS_EXECUTABLE_EXTENSION}` : GIT_NAME;
  const folders = pathVariable(host)
    .split(paths.delimiter)
    .filter((folder) => paths.isAbsolute(folder));
  for (const folder of folders) {
    const candidate = paths.join(folder, name);
    if (await host.fileSystem.isExecutableFile(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * The folder at or above `directory` that holds a `.git` entry (a folder, or the file of a
 * submodule or a linked work tree), or undefined. Git takes that folder as the work tree unless
 * `core.worktree` names another one; a planted `core.worktree` made git list another folder, and
 * the project looked empty. The tool gives git this folder as the work tree instead.
 */
export async function findWorkTree(
  directory: string,
  { platform, fileSystem }: GitHost,
): Promise<string | undefined> {
  const paths = pathsOf(platform);
  let folder = paths.resolve(directory);
  for (;;) {
    if (await fileSystem.hasEntry(paths.join(folder, GIT_FOLDER))) {
      return folder;
    }
    const parent = paths.dirname(folder);
    if (parent === folder) {
      return undefined;
    }
    folder = parent;
  }
}

/** The git file system on `node:fs`. */
export function createNodeGitFileSystem(): GitFileSystem {
  return {
    isExecutableFile: (path) =>
      succeeds(async () => {
        const isFile = (await stat(path)).isFile();
        await access(path, constants.X_OK);
        return isFile;
      }),
    hasEntry: (path) =>
      succeeds(async () => {
        await lstat(path);
        return true;
      }),
  };
}
