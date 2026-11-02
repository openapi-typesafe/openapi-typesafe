import type { FileStore } from "../../src/application/ports.ts";

/** FileStore over a Map. `resolve` prefixes a fake root so tests can map absolute paths back. */
export class InMemoryFileStore implements FileStore {
  static readonly ROOT = "/memory";
  readonly files = new Map<string, string>();

  constructor(initialFiles: Readonly<Record<string, string>> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, content);
    }
  }

  async readText(path: string): Promise<string | undefined> {
    return this.files.get(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  resolve(path: string): string {
    return `${InMemoryFileStore.ROOT}/${path}`;
  }

  /** Inverse of `resolve`, for fakes that receive absolute paths. */
  static toRelative(absolutePath: string): string {
    return absolutePath.slice(InMemoryFileStore.ROOT.length + 1);
  }
}
