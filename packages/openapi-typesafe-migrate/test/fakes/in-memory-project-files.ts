import type { ProjectFileList, ProjectFiles, SkippedFile } from "../../src/application/ports.js";

/** A project tree in memory; `written` records every write in order. */
export class InMemoryProjectFiles implements ProjectFiles {
  readonly files: Map<string, string>;
  readonly written: string[] = [];
  readonly #skipped: readonly SkippedFile[];

  constructor(files: Readonly<Record<string, string>>, skipped: readonly SkippedFile[] = []) {
    this.files = new Map(Object.entries(files));
    this.#skipped = skipped;
  }

  listFiles(): Promise<ProjectFileList> {
    return Promise.resolve({ files: [...this.files.keys()], skipped: this.#skipped });
  }

  read(path: string): Promise<string> {
    const text = this.files.get(path);
    return text === undefined
      ? Promise.reject(new Error(`ENOENT: ${path}`))
      : Promise.resolve(text);
  }

  write(path: string, text: string): Promise<void> {
    this.files.set(path, text);
    this.written.push(path);
    return Promise.resolve();
  }
}
