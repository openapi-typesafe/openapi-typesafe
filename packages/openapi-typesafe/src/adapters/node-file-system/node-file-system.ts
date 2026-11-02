import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { FileReader, FileWriter } from "../../application/ports/file-system.js";
import { ERROR_CODES, OpenAPITypesafeError } from "../../domain/errors.js";

/** The file ports on Node's `fs`, with the failures as typed errors (ADR-011). */

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

class NodeFileSystem implements FileReader, FileWriter {
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
}

/** File access for the CLI. */
export function createNodeFileSystem(): FileReader & FileWriter {
  return new NodeFileSystem();
}
