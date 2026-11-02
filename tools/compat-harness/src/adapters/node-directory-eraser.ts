import { rm } from "node:fs/promises";
import type { DirectoryEraser } from "../application/ports.ts";

/** Retries ride out "directory not empty" races while a killed process still writes its files. */
const ERASE_RETRY_COUNT = 3;

export class NodeDirectoryEraser implements DirectoryEraser {
  async erase(absolutePath: string): Promise<void> {
    await rm(absolutePath, { recursive: true, force: true, maxRetries: ERASE_RETRY_COUNT });
  }
}
