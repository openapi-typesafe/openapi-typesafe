import { constants } from "node:fs";
import { access, lstat, realpath, stat } from "node:fs/promises";
import { posix, win32 } from "node:path";
import type { GitEnvironment } from "./git-process.js";

/** What the git adapter reads from the file system to find git and the repository of a folder. */
export interface GitFileSystem {
  /** Whether `path` is a file that this process may execute. */
  isExecutableFile(path: string): Promise<boolean>;
  /** Whether anything (a file, a folder, a link) is at `path`. */
  hasEntry(path: string): Promise<boolean>;
  /** The path with every link resolved, or undefined when nothing usable is at `path`. */
  realPath(path: string): Promise<string | undefined>;
}

/** Where git is looked for: the process environment, its platform and its file system. */
export interface GitHost {
  readonly environment: GitEnvironment;
  readonly platform: NodeJS.Platform;
  readonly fileSystem: GitFileSystem;
  /** The folder the tool migrates. It is not trusted, so no git in it or under it runs. */
  readonly projectRoot: string;
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
const PARENT_FOLDER = "..";
/**
 * Errors that mean "nothing usable is there": a missing path, a parent that is not a folder, or
 * no permission. Any other error is a fault of the file system and is passed on.
 */
const ABSENT_CODES: ReadonlySet<string> = new Set(["ENOENT", "ENOTDIR", "EACCES", "EPERM"]);

function isAbsent(error: unknown): boolean {
  return ABSENT_CODES.has((error as NodeJS.ErrnoException | undefined)?.code ?? "");
}

/** What `check` gives, or `absent` when it fails because nothing usable is at the path. */
async function unlessAbsent<T>(check: () => Promise<T>, absent: T): Promise<T> {
  try {
    return await check();
  } catch (error) {
    if (isAbsent(error)) {
      return absent;
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

/** Whether the real path `target` is the real folder `folder` or lies under it. */
function isAtOrUnder(paths: typeof posix, folder: string, target: string): boolean {
  const path = paths.relative(folder, target);
  return (
    !(path === PARENT_FOLDER || path.startsWith(`${PARENT_FOLDER}${paths.sep}`)) &&
    !paths.isAbsolute(path)
  );
}

/**
 * Whether a PATH entry is a folder outside the project. An empty or relative entry names a
 * folder relative to the working directory, and npx puts the project's `node_modules/.bin` on
 * PATH as an absolute path; both can hold a planted git, so both are passed over.
 */
async function isOutsideProject(host: GitHost, project: string, folder: string): Promise<boolean> {
  const paths = pathsOf(host.platform);
  if (!paths.isAbsolute(folder)) {
    return false;
  }
  const real = await host.fileSystem.realPath(folder);
  return real !== undefined && !isAtOrUnder(paths, project, real);
}

/**
 * The absolute path of the first git on PATH outside the project, or undefined when there is
 * none. The absolute path also keeps Windows from looking in the working directory first, as it
 * does for a bare program name: a `git.exe` planted at the project root never runs.
 */
export async function findGitExecutable(host: GitHost): Promise<string | undefined> {
  const paths = pathsOf(host.platform);
  const name = host.platform === WINDOWS ? `${GIT_NAME}${WINDOWS_EXECUTABLE_EXTENSION}` : GIT_NAME;
  const root = paths.resolve(host.projectRoot);
  const project = (await host.fileSystem.realPath(root)) ?? root;
  for (const folder of pathVariable(host).split(paths.delimiter)) {
    const candidate = paths.join(folder, name);
    const isTrusted = await isOutsideProject(host, project, folder);
    if (isTrusted && (await host.fileSystem.isExecutableFile(candidate))) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Whether git takes `folder` as the root of a repository when it looks no higher than `ceiling`
 * (the parent of `folder`, or `folder` itself at the root of the file system).
 */
export type RepositoryCheck = (folder: string, ceiling: string) => Promise<boolean>;

/**
 * The nearest folder at or above `directory` whose `.git` entry (a folder, or the file of a
 * submodule or a linked work tree) git takes as a repository, or undefined. Git takes that folder
 * as the work tree unless `core.worktree` names another one; a planted `core.worktree` made git
 * list another folder, and the project looked empty, so the tool gives git this folder as the
 * work tree. Git passes over a `.git` that is no repository (an empty folder) and finds the one
 * above it, so `isRepository` asks git about each folder that has a `.git` entry.
 */
export async function findWorkTree(
  directory: string,
  { platform, fileSystem }: GitHost,
  isRepository: RepositoryCheck,
): Promise<string | undefined> {
  const paths = pathsOf(platform);
  let folder = paths.resolve(directory);
  for (;;) {
    const parent = paths.dirname(folder);
    const hasGit = await fileSystem.hasEntry(paths.join(folder, GIT_FOLDER));
    if (hasGit && (await isRepository(folder, parent))) {
      return folder;
    }
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
      unlessAbsent(async () => {
        const isFile = (await stat(path)).isFile();
        await access(path, constants.X_OK);
        return isFile;
      }, false),
    hasEntry: (path) =>
      unlessAbsent(async () => {
        await lstat(path);
        return true;
      }, false),
    realPath: (path) => unlessAbsent<string | undefined>(() => realpath(path), undefined),
  };
}
