import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { FileIdentity, FileReader, FileWriter } from "../../application/ports/file-system.js";
import { ERROR_CODES, OpenAPITypesafeError } from "../../domain/errors.js";

/** The file ports on Node's `fs`, with the failures as typed errors (ADR-011). */

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The file's status, or undefined when it cannot be read. A missing output is the common case; any
 * other failure (no access, a file used as a directory) is reported by the read or write that
 * follows, so the identity check does not report it a second time.
 */
function statusOf(file: string): fs.BigIntStats | undefined {
  try {
    return fs.statSync(file, { bigint: true });
  } catch {
    return undefined;
  }
}

/** One device and one file number is one file, also through a hard link. */
function hasSameFileNumber(left: fs.BigIntStats, right: fs.BigIntStats): boolean {
  // Some file systems (FAT, some network shares) report no file number: 0 then proves nothing.
  return left.ino !== 0n && left.ino === right.ino && left.dev === right.dev;
}

function isSameExistingFile(left: string, right: string): boolean {
  const leftStatus = statusOf(left);
  const rightStatus = statusOf(right);
  if (!leftStatus || !rightStatus) {
    return false;
  }
  // The native `realpath` resolves symbolic links and returns the letter case stored on disk,
  // which the JavaScript one does not do on a case-insensitive file system.
  return (
    hasSameFileNumber(leftStatus, rightStatus) ||
    fs.realpathSync.native(left) === fs.realpathSync.native(right)
  );
}

class NodeFileSystem implements FileReader, FileWriter, FileIdentity {
  readText(file: URL): string {
    try {
      return fs.readFileSync(file, "utf8");
    } catch (cause) {
      throw new OpenAPITypesafeError({
        code: ERROR_CODES.OUTPUT_READ_FAILED,
        message: `Cannot read ${fileURLToPath(file)}: ${causeMessage(cause)}`,
        details: { file: fileURLToPath(file) },
        cause,
      });
    }
  }

  writeText(file: URL, contents: string): void {
    try {
      fs.mkdirSync(new URL(".", file), { recursive: true });
      fs.writeFileSync(file, contents, "utf8");
    } catch (cause) {
      throw new OpenAPITypesafeError({
        code: ERROR_CODES.OUTPUT_WRITE_FAILED,
        message: `Cannot write ${fileURLToPath(file)}: ${causeMessage(cause)}`,
        details: { file: fileURLToPath(file) },
        cause,
      });
    }
  }

  isSameFile(left: URL, right: URL): boolean {
    const leftPath = fileURLToPath(left);
    const rightPath = fileURLToPath(right);
    return leftPath === rightPath || isSameExistingFile(leftPath, rightPath);
  }
}

/** File access for the CLI. */
export function createNodeFileSystem(): FileReader & FileWriter & FileIdentity {
  return new NodeFileSystem();
}
