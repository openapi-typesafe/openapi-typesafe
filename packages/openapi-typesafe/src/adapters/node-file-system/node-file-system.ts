import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  DirectoryCheck,
  FileIdentity,
  FileReader,
  FileWriter,
} from "../../application/ports/file-system.js";
import { ERROR_CODES, type ErrorCode, OpenAPITypesafeError } from "../../domain/errors.js";
import {
  type FileNumber,
  fileIdentityKey,
  isSameFileNumber,
  type PathQueries,
} from "./file-identity.js";

/** The file ports on Node's `fs`, with the failures as typed errors (ADR-011). */

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The file number of a path, or undefined when it cannot be read. A missing output is the common
 * case; any other failure (no access, a file used as a directory) is reported by the read or write
 * that follows, so the identity check does not report it a second time.
 */
function statusOf(filePath: string): FileNumber | undefined {
  try {
    const status = fs.statSync(filePath, { bigint: true });
    return { device: status.dev, file: status.ino };
  } catch {
    return undefined;
  }
}

/**
 * The native `realpath` resolves symbolic links and returns the letter case stored on disk, which
 * the JavaScript one does not do on a case-insensitive file system. A path that vanished since its
 * status was read keeps its own spelling.
 */
function realPathOf(filePath: string): string {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return filePath;
  }
}

/** A directory that cannot be listed has no entry to tell its letter case rules by. */
function entriesOf(directory: string): readonly string[] {
  try {
    return fs.readdirSync(directory);
  } catch {
    return [];
  }
}

const NODE_PATH_QUERIES: PathQueries = {
  status: statusOf,
  realPath: realPathOf,
  entries: entriesOf,
};

/** The path of a `file:` URL, or undefined for a URL that names no file on this platform. */
function localPathOf(file: URL): string | undefined {
  try {
    return fileURLToPath(file);
  } catch {
    return undefined;
  }
}

/**
 * A failed read or write as a typed error. The location is named by its path, or by the URL when
 * it names no local file: computing the path must not throw a second, untyped error here.
 */
function fileError(code: ErrorCode, verb: string, file: URL, cause: unknown): OpenAPITypesafeError {
  const name = localPathOf(file) ?? file.href;
  return new OpenAPITypesafeError({
    code,
    message: `Cannot ${verb} ${name}: ${causeMessage(cause)}`,
    details: { file: name },
    cause,
  });
}

class NodeFileSystem implements FileReader, FileWriter, FileIdentity, DirectoryCheck {
  readText(file: URL): string {
    try {
      return fs.readFileSync(file, "utf8");
    } catch (cause) {
      throw fileError(ERROR_CODES.OUTPUT_READ_FAILED, "read", file, cause);
    }
  }

  writeText(file: URL, contents: string): void {
    try {
      fs.mkdirSync(new URL(".", file), { recursive: true });
      fs.writeFileSync(file, contents, "utf8");
    } catch (cause) {
      throw fileError(ERROR_CODES.OUTPUT_WRITE_FAILED, "write", file, cause);
    }
  }

  isDirectory(file: URL): boolean {
    try {
      return fs.statSync(file).isDirectory();
    } catch {
      // Missing or unreadable: not a directory; the write that follows reports a failure.
      return false;
    }
  }

  isSameFile(left: URL, right: URL): boolean {
    const leftPath = fileURLToPath(left);
    const rightPath = fileURLToPath(right);
    if (leftPath === rightPath) {
      return true;
    }
    const leftStatus = statusOf(leftPath);
    const rightStatus = statusOf(rightPath);
    if (leftStatus && rightStatus && isSameFileNumber(leftStatus, rightStatus)) {
      return true;
    }
    return (
      fileIdentityKey(leftPath, NODE_PATH_QUERIES) === fileIdentityKey(rightPath, NODE_PATH_QUERIES)
    );
  }
}

/** File access for the CLI. */
export function createNodeFileSystem(): FileReader & FileWriter & FileIdentity & DirectoryCheck {
  return new NodeFileSystem();
}
