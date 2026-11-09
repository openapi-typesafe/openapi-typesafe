import fs from "node:fs";
import path from "node:path";
import type { ClaimedFile } from "../../application/ports/file-system.js";
import { creationPath, type FileNumber, type PathQueries } from "./file-identity.js";

/**
 * Claiming an output on Node's `fs` (ADR-043, decision 1): the file is opened for appending,
 * which creates it when it is missing (also through a symbolic link) and never truncates it.
 * The device and file number of the open file are its identity. A claim or a write that fails
 * removes the directories it created.
 */

/**
 * The directories that do not exist yet on the way to `directory`, deepest first: the ones a
 * recursive `fs.mkdirSync` creates. They are listed before it runs, in the form of `directory`
 * itself: on Windows the path that `fs.mkdirSync` returns did not match that form, so comparing
 * with it found no new directory and a failed run left them behind.
 */
export function missingDirectories(
  directory: string,
  exists: (candidate: string) => boolean,
): string[] {
  const missing: string[] = [];
  for (let current = directory; !exists(current); current = path.dirname(current)) {
    missing.push(current);
    if (path.dirname(current) === current) {
      break;
    }
  }
  return missing;
}

/**
 * The identity of an open file: its device and file number, or its stored path on a file system
 * that reports the file number 0 (FAT, some network shares), which proves nothing.
 */
export function claimIdentity(number: FileNumber, storedPath: () => string): string {
  return number.file === 0n ? `path:${storedPath()}` : `${number.device}:${number.file}`;
}

function identityOf(descriptor: number, filePath: string): string {
  const status = fs.fstatSync(descriptor, { bigint: true });
  return claimIdentity({ device: status.dev, file: status.ino }, () =>
    fs.realpathSync.native(filePath),
  );
}

function errorCodeOf(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}

/** Remove the new directories, deepest first, until one holds another file. */
function removeDirectories(directories: readonly string[]): void {
  for (const directory of directories) {
    try {
      fs.rmdirSync(directory);
    } catch (error) {
      const code = errorCodeOf(error);
      // Another output or the user put a file there since: the directory and its parents stay.
      if (code === "ENOTEMPTY" || code === "EEXIST") {
        return;
      }
      // Removed since: nothing to remove, but its parents may still be empty. Windows also gives
      // ENOENT for a file put in its place, which must fail like any other path it cannot remove.
      if (code !== "ENOENT" || fs.lstatSync(directory, { throwIfNoEntry: false }) !== undefined) {
        throw error;
      }
    }
  }
}

/**
 * Create `directory` and give the directories that this created. Through a link to a missing
 * directory it creates the link's target, as a write through the link would, so the path to
 * create and the new directories are real paths, where links are already followed.
 */
function createDirectory(directory: string, queries: PathQueries): string[] {
  const target = creationPath(directory, queries);
  const missing = missingDirectories(target, fs.existsSync);
  fs.mkdirSync(target, { recursive: true });
  return missing;
}

/** Open `filePath` for appending, which creates it, and give its identity and whether it is new. */
function openClaim(filePath: string): { identity: string; createdFile: string | undefined } {
  const isCreated = !fs.existsSync(filePath);
  const descriptor = fs.openSync(filePath, "a");
  try {
    const identity = identityOf(descriptor, filePath);
    // A link to a missing file created its target: that file is what the claim removes.
    return { identity, createdFile: isCreated ? fs.realpathSync.native(filePath) : undefined };
  } finally {
    fs.closeSync(descriptor);
  }
}

/**
 * Claim the file at `filePath`; the caller turns a failure into a typed error. A claim that fails
 * after creating directories (a file name too long for the file system) removes them again.
 */
export function claimFileAt(filePath: string, queries: PathQueries): ClaimedFile {
  const directories = createDirectory(path.dirname(filePath), queries);
  let opened: ReturnType<typeof openClaim>;
  try {
    opened = openClaim(filePath);
  } catch (error) {
    removeDirectories(directories);
    throw error;
  }
  const { identity, createdFile } = opened;
  return {
    identity,
    release: () => {
      if (createdFile !== undefined) {
        fs.rmSync(createdFile, { force: true });
      }
      removeDirectories(directories);
    },
  };
}

/** Write `contents` to `filePath`, creating its directory; a failed write removes what it made. */
export function writeFileAt(filePath: string, contents: string, queries: PathQueries): void {
  const directories = createDirectory(path.dirname(filePath), queries);
  try {
    fs.writeFileSync(filePath, contents, "utf8");
  } catch (error) {
    removeDirectories(directories);
    throw error;
  }
}
