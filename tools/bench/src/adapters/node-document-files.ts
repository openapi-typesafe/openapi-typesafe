import { stat } from "node:fs/promises";
import type { DocumentFiles } from "../application/ports.ts";

/** Document sizes from the file system. */
export class NodeDocumentFiles implements DocumentFiles {
  async byteLength(path: string): Promise<number> {
    return (await stat(path)).size;
  }
}
