import type { DirectoryEraser } from "../../src/application/ports.ts";
import { InMemoryFileStore } from "./in-memory-file-store.ts";

/** DirectoryEraser that records erased paths and deletes their files from an in-memory store. */
export class RecordingDirectoryEraser implements DirectoryEraser {
  readonly erased: string[] = [];
  readonly #store: InMemoryFileStore;

  constructor(store: InMemoryFileStore) {
    this.#store = store;
  }

  async erase(absolutePath: string): Promise<void> {
    this.erased.push(absolutePath);
    const prefix = `${InMemoryFileStore.toRelative(absolutePath)}/`;
    for (const path of [...this.#store.files.keys()]) {
      if (path.startsWith(prefix)) {
        this.#store.files.delete(path);
      }
    }
  }
}
