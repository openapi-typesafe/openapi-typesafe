import type { ProjectFiles } from "../../src/application/ports.js";

/** A project tree in memory; `written` records every write in order. */
export class InMemoryProjectFiles implements ProjectFiles {
  readonly files: Map<string, string>;
  readonly written: string[] = [];

  constructor(files: Readonly<Record<string, string>>) {
    this.files = new Map(Object.entries(files));
  }

  listFiles(): Promise<string[]> {
    return Promise.resolve([...this.files.keys()]);
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
