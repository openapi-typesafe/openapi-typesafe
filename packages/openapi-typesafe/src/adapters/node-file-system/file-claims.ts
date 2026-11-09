import fs from "node:fs";
import path from "node:path";
import type { ClaimedFile } from "../../application/ports/file-system.js";
import type { FileNumber } from "./file-identity.js";

/**
 * Claiming an output on Node's `fs` (ADR-043, decision 1): the file is opened for appending,
 * which creates it when it is missing (also through a symbolic link) and never truncates it.
 * The device and file number of the open file are its identity.
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
      // Another output or the user put a file there since: the directory and its parents stay.
      if (errorCodeOf(error) === "ENOTEMPTY" || errorCodeOf(error) === "EEXIST") {
        return;
      }
      throw error;
    }
  }
}

/** Claim the file at `filePath`; the caller turns a failure into a typed error. */
export function claimFileAt(filePath: string): ClaimedFile {
  const directory = path.dirname(filePath);
  const directories = missingDirectories(directory, fs.existsSync);
  fs.mkdirSync(directory, { recursive: true });
  const isCreated = !fs.existsSync(filePath);
  const descriptor = fs.openSync(filePath, "a");
  let identity: string;
  try {
    identity = identityOf(descriptor, filePath);
  } finally {
    fs.closeSync(descriptor);
  }
  // A link to a missing file created its target: that file is what the claim removes.
  const createdFile = isCreated ? fs.realpathSync.native(filePath) : undefined;
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
